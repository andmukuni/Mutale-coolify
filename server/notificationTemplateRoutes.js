import {
  TEMPLATE_PLACEHOLDERS,
  SAMPLE_TEMPLATE_VARS,
  renderTemplate,
} from '../shared/notificationTemplates.js';
import {
  listNotificationTemplates,
  getNotificationTemplateById,
  createNotificationTemplate,
  updateNotificationTemplate,
  resetNotificationTemplate,
  deleteNotificationTemplate,
} from './notificationTemplateService.js';

export function registerNotificationTemplateRoutes(app, { pool } = {}) {
  app.get('/api/admin/notification-templates', async (req, res) => {
    try {
      const channel = String(req.query?.channel || '').trim();
      const data = await listNotificationTemplates(pool, { channel: channel || undefined });
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(500).json({ ok: false, message: 'Failed to load templates.', error: error.message });
    }
  });

  app.get('/api/admin/notification-templates/placeholders', (_req, res) => {
    return res.json({
      ok: true,
      data: {
        placeholders: TEMPLATE_PLACEHOLDERS,
        sampleVars: SAMPLE_TEMPLATE_VARS,
      },
    });
  });

  app.post('/api/admin/notification-templates/preview', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const vars = body.vars && typeof body.vars === 'object' ? { ...SAMPLE_TEMPLATE_VARS, ...body.vars } : SAMPLE_TEMPLATE_VARS;
      return res.json({
        ok: true,
        data: {
          subject: renderTemplate(body.subject || '', vars),
          body: renderTemplate(body.body || '', vars),
        },
      });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error.message || 'Failed to preview template.' });
    }
  });

  app.post('/api/admin/notification-templates', async (req, res) => {
    try {
      const data = await createNotificationTemplate(pool, req.body || {});
      return res.status(201).json({ ok: true, data });
    } catch (error) {
      const status = /required|reserved|already exists/i.test(error.message) ? 400 : 500;
      return res.status(status).json({ ok: false, message: error.message });
    }
  });

  app.put('/api/admin/notification-templates/:id', async (req, res) => {
    try {
      const data = await updateNotificationTemplate(pool, req.params.id, req.body || {});
      return res.json({ ok: true, data });
    } catch (error) {
      const status = error.message === 'Template not found.' ? 404 : (/required/i.test(error.message) ? 400 : 500);
      return res.status(status).json({ ok: false, message: error.message });
    }
  });

  app.post('/api/admin/notification-templates/:id/reset', async (req, res) => {
    try {
      const data = await resetNotificationTemplate(pool, req.params.id);
      return res.json({ ok: true, data });
    } catch (error) {
      const status = error.message === 'Template not found.' ? 404 : 400;
      return res.status(status).json({ ok: false, message: error.message });
    }
  });

  app.delete('/api/admin/notification-templates/:id', async (req, res) => {
    try {
      await deleteNotificationTemplate(pool, req.params.id);
      return res.json({ ok: true, message: 'Template deleted.' });
    } catch (error) {
      const status = error.message === 'Template not found.' ? 404 : 400;
      return res.status(status).json({ ok: false, message: error.message });
    }
  });
}
