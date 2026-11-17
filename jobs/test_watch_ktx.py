"""
KTX 잔여석 감시 · 카카오 발송 테스트 (외부 호출은 모두 가짜로 바꾼다).

  cd jobs && python3 -m unittest test_watch_ktx -v
"""

from __future__ import annotations

import json
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

import kakao_notify
import watch_ktx as w


def train(no: str, gen: str, dpt_tm: str = "172400") -> dict:
    return {
        "h_trn_no": no,
        "h_trn_clsf_nm": "KTX-산천",
        "h_gen_rsv_cd": gen,
        "h_spe_rsv_cd": "13",
        "h_rsv_psb_nm": "예약하기" if gen == "11" else "매진",
        "h_dpt_dt": "20261127",
        "h_dpt_tm": dpt_tm,
    }


def payload(*trains: dict) -> dict:
    return {"strResult": "SUCC", "trn_infos": {"trn_info": list(trains)}}


def config(tmp: Path) -> w.Config:
    cfg = w.Config(dep="나주", arr="용산", date="20261127", time="172000", train_no="466", adults=1, interval=60)
    return cfg


class JudgeTest(unittest.TestCase):
    def test_available(self):
        r = w.judge(payload(train("00464", "13", "165000"), train("00466", "11")), "466")
        self.assertEqual(r["state"], w.AVAILABLE)
        self.assertEqual(r["departure"], "20261127172400")

    def test_sold_out(self):
        self.assertEqual(w.judge(payload(train("466", "13")), "466")["state"], w.SOLD_OUT)

    def test_train_missing(self):
        r = w.judge(payload(train("468", "11")), "466")
        self.assertEqual(r["state"], w.UNKNOWN)

    def test_fail(self):
        r = w.judge({"strResult": "FAIL", "h_msg_cd": "P058", "h_msg_txt": "로그인 필요"}, "466")
        self.assertEqual(r["state"], w.UNKNOWN)
        self.assertIn("P058", r["summary"])

    def test_single_train_object(self):
        p = {"strResult": "SUCC", "trn_infos": {"trn_info": train("466", "11")}}
        self.assertEqual(w.judge(p, "466")["state"], w.AVAILABLE)


class DecideTest(unittest.TestCase):
    def test_transitions(self):
        self.assertEqual(w.decide(None, w.AVAILABLE), "available")
        self.assertEqual(w.decide(w.SOLD_OUT, w.AVAILABLE), "available")
        self.assertEqual(w.decide(w.AVAILABLE, w.SOLD_OUT), "soldout")
        self.assertIsNone(w.decide(None, w.SOLD_OUT))
        self.assertIsNone(w.decide(w.SOLD_OUT, w.SOLD_OUT))
        self.assertIsNone(w.decide(w.AVAILABLE, w.AVAILABLE))
        self.assertIsNone(w.decide(w.AVAILABLE, w.UNKNOWN))


class WatcherTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.cfg = config(self.tmp)
        self.state_file = self.tmp / "state.json"
        patches = [
            mock.patch.object(w.Config, "state_file", property(lambda _: self.state_file)),
            mock.patch.object(w, "LOG_FILE", self.tmp / "watch.log"),
            mock.patch.object(w, "post_status", return_value=True),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.post_status = w.post_status
        self.sent: list[str] = []
        self.send_ok = True

        def fake_send(text, on_error=print, **_):
            self.sent.append(text)
            return self.send_ok

        send = mock.patch.object(w, "send_to_me", side_effect=fake_send)
        send.start()
        self.addCleanup(send.stop)

    def run_sequence(self, watcher: w.Watcher, gens: list[str | None]) -> None:
        for gen in gens:
            p = payload(train("466", gen)) if gen else {"strResult": "FAIL", "h_msg_cd": "X"}
            with mock.patch.object(w, "fetch_schedule", return_value=p):
                watcher.check()

    def statuses(self) -> list[str]:
        return [c.args[1] for c in self.post_status.call_args_list]

    def test_notifies_only_on_transitions(self):
        watcher = w.Watcher(self.cfg)
        # 매진 → 매진 → (에러) → 가능 → 가능 → 매진 → 가능
        self.run_sequence(watcher, ["13", "13", None, "11", "11", "13", "11"])
        self.assertEqual(len(self.sent), 3)
        self.assertIn("예약 가능", self.sent[0])
        self.assertIn("다시 매진", self.sent[1])
        self.assertIn("11/27(금) 나주 17:24 → 용산", self.sent[0])
        self.assertEqual(self.statuses().count("COMPLETE"), 2)
        self.assertEqual(json.loads(self.state_file.read_text(encoding="utf-8"))["last"], w.AVAILABLE)

    def test_restart_does_not_repeat(self):
        self.run_sequence(w.Watcher(self.cfg), ["11"])
        self.run_sequence(w.Watcher(self.cfg), ["11"])  # 재시작 후 같은 상태
        self.assertEqual(len(self.sent), 1)

    def test_reads_state_written_by_other_process(self):
        watcher = w.Watcher(self.cfg)
        self.run_sequence(watcher, ["13"])
        other = w.Watcher(self.cfg)  # once 등 다른 프로세스가 먼저 '예약 가능'을 알림
        self.run_sequence(other, ["11"])
        self.run_sequence(watcher, ["11"])
        self.assertEqual(len(self.sent), 1)

    def test_send_failure_retries_next_cycle(self):
        watcher = w.Watcher(self.cfg)
        self.send_ok = False
        self.run_sequence(watcher, ["11", "11"])
        self.assertEqual(len(self.sent), 2)
        self.assertEqual(self.statuses().count("ERROR"), 1)  # 실패가 이어져도 ERROR 는 1번
        self.assertFalse(self.state_file.exists())
        self.send_ok = True
        self.run_sequence(watcher, ["11", "11"])
        self.assertEqual(len(self.sent), 3)

    def test_error_alert_after_consecutive_failures(self):
        watcher = w.Watcher(self.cfg)
        self.run_sequence(watcher, [None] * (w.ERROR_ALERT_AFTER + 2))
        self.assertEqual(self.statuses().count("ERROR"), 1)
        self.assertEqual(self.sent, [])

    def test_departure(self):
        watcher = w.Watcher(self.cfg)
        self.run_sequence(watcher, ["13"])
        self.assertEqual(w.departure_at(self.cfg, watcher.state), datetime(2026, 11, 27, 17, 24, tzinfo=w.KST))


class KakaoTest(unittest.TestCase):
    def setUp(self):
        self.path = Path(tempfile.mkdtemp()) / "token.json"
        env = mock.patch.dict("os.environ", {"KAKAO_REST_API_KEY": "rest-key", "KAKAO_CLIENT_SECRET": ""})
        env.start()
        self.addCleanup(env.stop)

    def resp(self, status: int, body: dict | None = None) -> mock.Mock:
        r = mock.Mock(status_code=status, ok=200 <= status < 300, text=json.dumps(body or {}))
        r.json.return_value = body or {}
        return r

    def test_refresh_on_401_and_keep_rotated_refresh_token(self):
        kakao_notify.save_token({"access_token": "old", "expires_at": time.time() + 3600, "refresh_token": "r1"}, self.path)
        posts = [
            self.resp(401),  # 발송: 만료
            self.resp(200, {"access_token": "new", "expires_in": 21599, "refresh_token": "r2"}),  # 갱신
            self.resp(200, {"result_code": 0}),  # 재발송
        ]
        with mock.patch.object(kakao_notify.requests, "post", side_effect=posts) as post:
            self.assertTrue(kakao_notify.send_to_me("hi", path=self.path, on_error=self.fail))
        refresh_call = post.call_args_list[1]
        self.assertEqual(refresh_call.kwargs["data"]["grant_type"], "refresh_token")
        self.assertEqual(refresh_call.kwargs["data"]["refresh_token"], "r1")
        self.assertEqual(post.call_args_list[2].kwargs["headers"]["Authorization"], "Bearer new")
        saved = kakao_notify.load_token(self.path)
        self.assertEqual((saved["access_token"], saved["refresh_token"]), ("new", "r2"))

    def test_refresh_before_expiry_keeps_refresh_token(self):
        kakao_notify.save_token({"access_token": "old", "expires_at": 0, "refresh_token": "r1"}, self.path)
        posts = [self.resp(200, {"access_token": "new", "expires_in": 21599}), self.resp(200, {"result_code": 0})]
        with mock.patch.object(kakao_notify.requests, "post", side_effect=posts):
            self.assertTrue(kakao_notify.send_to_me("hi", path=self.path, on_error=self.fail))
        self.assertEqual(kakao_notify.load_token(self.path)["refresh_token"], "r1")

    def test_missing_token_file(self):
        errors: list[str] = []
        self.assertFalse(kakao_notify.send_to_me("hi", path=self.path, on_error=errors.append))
        self.assertIn("kakao_auth.py", errors[0])


if __name__ == "__main__":
    unittest.main()
