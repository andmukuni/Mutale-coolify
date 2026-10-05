import {
  exportEventAttendees,
  getEventAttendee,
  listEventAttendees,
} from './registrationAttendeeService.js';

function actorId(req) {
  return req.adminUser?.sub || req.adminUser?.id || req.adminUser?.email || null;
}

function sendServiceError(res, error, fallback) {
  const status = Number(error?.status) || 500;
  return res.status(status).json({
    ok: false,
    message: status === 500 ? fallback : error.message,
  });
}

export function registerRegistrationAttendeeRoutes(app, { pool }) {
  app.get('/api/admin/events/:eventId/attendees', async (req, res) => {
    try {
      const result = await listEventAttendees(pool, req.params.eventId, {
        q: req.query?.q,
        status: req.query?.status,
        payment_status: req.query?.payment_status,
        attended: req.query?.attended,
      });
      return res.json({
        ok: true,
        data: result.rows,
        fields: result.fields.map((field) => ({
          id: field.id,
          label: field.label,
          group: field.group,
          type: field.type,
          sticky: Boolean(field.sticky),
          minWidth: field.minWidth || 140,
          truncate: field.truncate || 0,
          historical: Boolean(field.historical),
          labelUncertain: Boolean(field.labelUncertain),
        })),
        total: result.total,
        unfiltered_total: result.unfiltered_total,
        event: result.event,
      });
    } catch (error) {
      return sendServiceError(res, error, 'Failed to load attendees.');
    }
  });

  app.get('/api/admin/events/:eventId/attendees/:registrationId', async (req, res) => {
    try {
      const result = await getEventAttendee(pool, req.params.eventId, req.params.registrationId);
      return res.json({
        ok: true,
        data: result.row,
        fields: result.fields.map((field) => ({
          id: field.id,
          label: field.label,
          group: field.group,
          type: field.type,
          historical: Boolean(field.historical),
          labelUncertain: Boolean(field.labelUncertain),
        })),
        event: result.event,
      });
    } catch (error) {
      return sendServiceError(res, error, 'Failed to load attendee.');
    }
  });

  app.post('/api/admin/events/:eventId/attendees/export', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await exportEventAttendees(pool, {
        eventId: req.params.eventId,
        scope: body.scope,
        format: body.format,
        q: body.q ?? req.query?.q,
        status: body.status ?? body.filters?.status,
        payment_status: body.payment_status ?? body.filters?.payment_status,
        attended: body.attended ?? body.filters?.attended,
        ids: body.ids,
        actorId: actorId(req),
      });

      res.setHeader('Content-Type', result.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('X-Export-Count', String(result.count));
      res.setHeader('X-Export-Scope', result.scope);
      return res.send(result.buffer);
    } catch (error) {
      return sendServiceError(res, error, 'Failed to export attendees.');
    }
  });
}
