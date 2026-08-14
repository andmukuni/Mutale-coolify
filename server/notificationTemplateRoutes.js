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
  buildTemplateTestContent,
  wrapTemplateEmailHtml,
} from './notificationTemplateService.js';

export function registerNotificationTemplateRoutes(app, {
  pool,
  sendEmailNotification,
  sendSmsNotification,
  getSystemSettings,
} = {}) {
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

  app.post('/api/admin/notification-templates/test', async (req, res) => {
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const recipient = String(payload.recipient || '').trim();
      const rendered = buildTemplateTestContent({
        channel: payload.channel,
        subject: payload.subject,
        body: payload.body,
        vars: payload.vars,
      });

      if (!rendered.body) {
        return res.status(400).json({ ok: false, message: 'Add message copy before sending a test.' });
      }
      if (!recipient) {
        return res.status(400).json({
          ok: false,
          message: rendered.channel === 'email'
            ? 'Enter an email address to send the test.'
            : 'Enter a phone number to send the test.',
        });
      }
      if (typeof sendEmailNotification !== 'function' || typeof sendSmsNotification !== 'function' || typeof getSystemSettings !== 'function') {
        return res.status(500).json({ ok: false, message: 'Test sending is not configured.' });
      }

      const settings = await getSystemSettings();
      let result;

      if (rendered.channel === 'email') {
        if (!recipient.includes('@')) {
          return res.status(400).json({ ok: false, message: 'Enter a valid email address.' });
        }
        const subject = rendered.subject || 'Mutale template test';
        result = await sendEmailNotification({
          settings,
          to: recipient,
          subject: `[TEST] ${subject}`,
          text: rendered.body,
          html: wrapTemplateEmailHtml({ subject, body: rendered.body }),
          skipSms: true,
          kind: 'template_test',
        });
      } else {
        result = await sendSmsNotification({
          settings,
          to: recipient,
          message: rendered.body,
        });
      }

      if (result?.status !== 'sent') {
        return res.status(400).json({
          ok: false,
          message: result?.reason || 'Test was not sent.',
          data: result,
        });
      }

      return res.json({
        ok: true,
        message: rendered.channel === 'email' ? 'Test email sent.' : 'Test SMS sent.',
        data: result,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error.message || 'Failed to send test.' });
    }
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
