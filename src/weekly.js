// China Standard Time is UTC+08:00 throughout the reporting period.
const REPORT_DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_OFFSET_MS = 8 * 60 * 60 * 1000;

function beijingDay(time = Date.now()) {
  return new Date(time + REPORT_OFFSET_MS).toISOString().slice(0, 10);
}

function countFileEvent(env, ctx, resourceId, event) {
  // Only a resource ID obtained from the database may be attributed. Unknown
  // URLs are aggregated into one bucket, without retaining the supplied path.
  ctx.waitUntil(query(env, `
    INSERT INTO file_metric_daily (day, rid, event, n) VALUES (?, ?, ?, 1)
    ON CONFLICT (day, rid, event) DO UPDATE SET n = n + 1
  `, beijingDay(), resourceId || '', event).run());
}

async function weeklyReport(env) {
  const time = Date.now();
  const startDay = beijingDay(time - 6 * REPORT_DAY_MS);
  const endDay = beijingDay(time);
  const from = new Date(startDay + 'T00:00:00+08:00').toISOString();
  const until = new Date(Date.parse(endDay + 'T00:00:00+08:00') + REPORT_DAY_MS).toISOString();
  const [downloads, errors, feedback] = await env.DB.batch([
    query(env, `
      SELECT m.rid, r.title, SUM(m.n) AS requests
      FROM file_metric_daily m JOIN resource r ON r.id = m.rid
      WHERE m.day BETWEEN ? AND ? AND m.event = 'download'
      GROUP BY m.rid, r.title ORDER BY requests DESC, m.rid
    `, startDay, endDay),
    query(env, `
      SELECT m.rid, r.title, m.event, SUM(m.n) AS requests
      FROM file_metric_daily m LEFT JOIN resource r ON r.id = m.rid
      WHERE m.day BETWEEN ? AND ? AND m.event <> 'download'
      GROUP BY m.rid, r.title, m.event ORDER BY requests DESC, m.rid, m.event
    `, startDay, endDay),
    query(env, `
      SELECT COUNT(CASE WHEN julianday(created) >= julianday(?) AND julianday(created) < julianday(?) THEN 1 END) AS received,
             COUNT(CASE WHEN status = '待处理' THEN 1 END) AS pending,
             COUNT(CASE WHEN status = '核对中' THEN 1 END) AS checking
      FROM feedback
    `, from, until)
  ]);
  return {startDay, endDay, downloads:downloads.results, errors:errors.results, feedback:feedback.results[0]};
}
