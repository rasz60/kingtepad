import {
  addDays,
  buildReportMarkdown,
  startOfWeek,
  summarize,
  todayKst,
  type Category,
  type Task,
  type WorkLog,
} from '@kingtepad/shared';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../supabase';

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  /** GET /reports/weekly?date=YYYY-MM-DD&format=md|json */
  app.get<{ Querystring: { date?: string; format?: 'md' | 'json' } }>('/reports/weekly', async (req, reply) => {
    const date = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : todayKst();
    const from = startOfWeek(date);
    const to = addDays(from, 6);

    const [logs, tasks, categories, holidays] = await Promise.all([
      req.db.from('work_logs').select('*').gte('log_date', from).lte('log_date', to),
      req.db.from('tasks').select('*').is('deleted_at', null),
      req.db.from('categories').select('id,name,color,sort_order'),
      req.db.from('holidays').select('date'),
    ]);
    const err = logs.error ?? tasks.error ?? categories.error ?? holidays.error;
    if (err) return reply.code(500).send({ error: err.message });

    const summary = summarize(from, to, tasks.data as Task[], logs.data as WorkLog[], categories.data as Category[]);
    const markdown = buildReportMarkdown(
      summary,
      tasks.data as Task[],
      new Set((holidays.data as { date: string }[]).map((h) => h.date)),
    );

    if (req.query.format === 'json') {
      return { from, to, totalMinutes: summary.totalMinutes, byCategory: summary.byCategory, markdown };
    }
    return reply.type('text/markdown; charset=utf-8').send(markdown);
  });
}
