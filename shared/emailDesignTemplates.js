import { defaultBlocks } from './emailDesignCompile.js';

export const EMAIL_DESIGN_TEMPLATE_SEED = [
  {
    slug: 'event_update',
    name: 'Event update',
    purpose: 'event_service',
    subject: '{{event_title}} — an update',
    preheader: 'A short update about your upcoming session.',
    design: {
      version: 1,
      blocks: [
        { id: 'u-h', type: 'header' },
        { id: 'u-t', type: 'heading', text: 'An update on {{event_title}}' },
        { id: 'u-b', type: 'text', text: 'Hi {{first_name}},\n\nHere is an update for people registered for this session.' },
        { id: 'u-e', type: 'event_details' },
        { id: 'u-btn', type: 'button', label: 'Open event details', url: '{{resource_page_url}}' },
        { id: 'u-f', type: 'footer' },
      ],
    },
  },
  {
    slug: 'joining_instructions',
    name: 'Joining instructions',
    purpose: 'event_service',
    subject: 'How to join {{event_title}}',
    preheader: 'Your time, venue or joining link, and registration reference.',
    design: {
      version: 1,
      blocks: [
        { id: 'j-h', type: 'header' },
        { id: 'j-t', type: 'heading', text: 'Joining {{event_title}}' },
        { id: 'j-b', type: 'text', text: 'Hi {{first_name}},\n\nKeep this note handy. Use your registration reference if you need help at the door or online.' },
        { id: 'j-e', type: 'event_details' },
        { id: 'j-btn', type: 'button', label: 'Join or view ticket', url: '{{venue_or_join}}' },
        { id: 'j-f', type: 'footer' },
      ],
    },
  },
  {
    slug: 'resources_delivery',
    name: 'Resources and workbook',
    purpose: 'event_service',
    subject: 'Your {{event_title}} resources',
    preheader: 'Download the materials for this event.',
    design: {
      version: 1,
      blocks: [
        { id: 'r-h', type: 'header' },
        { id: 'r-t', type: 'heading', text: 'Resources for {{event_title}}' },
        { id: 'r-b', type: 'text', text: 'Hi {{first_name}},\n\nYour event materials are ready. The download link is for this registration and can be forwarded.' },
        { id: 'r-c', type: 'resource_card', resource_title: 'Event workbook', resource_description: 'Download the file from your branded resource page.', url: '{{resource_page_url}}' },
        { id: 'r-f', type: 'footer' },
      ],
    },
  },
  {
    slug: 'post_event_thanks',
    name: 'Thank you and feedback',
    purpose: 'event_service',
    subject: 'Thank you for attending {{event_title}}',
    preheader: 'A note from Mutale, plus a short feedback link if available.',
    design: {
      version: 1,
      blocks: [
        { id: 't-h', type: 'header' },
        { id: 't-t', type: 'heading', text: 'Thank you, {{first_name}}' },
        { id: 't-b', type: 'text', text: 'Thank you for being part of {{event_title}}. If a feedback form is open, you will find it on your resource page.' },
        { id: 't-e', type: 'event_details' },
        { id: 't-btn', type: 'button', label: 'Open resources', url: '{{resource_page_url}}' },
        { id: 't-f', type: 'footer' },
      ],
    },
  },
];

export const CAMPAIGN_WORKSPACE_TEMPLATE_SEED = [
  {slug:'newsletter',name:'General newsletter',campaign_type:'regular',purpose:'promotional',subject:'An update from Mutale Mubanga',preheader:'Growing People.',design:{version:2,blocks:[{id:'n-logo',type:'header'},{id:'n-title',type:'heading',text:'Growing People.'},{id:'n-body',type:'text',text:'Dear {{first_name}},\n\nHere is our latest news and an opportunity to stay connected.'},{id:'n-footer',type:'footer'}]}},
  {slug:'event_invitation',name:'Event invitation',campaign_type:'event_invitation',purpose:'promotional',subject:'You are invited: {{event_title}}',preheader:'Let us know if you will attend.',design:{version:2,blocks:[{id:'i-logo',type:'header'},{id:'i-title',type:'heading',text:'You are invited to {{event_title}}'},{id:'i-body',type:'text',text:'Dear {{first_name}},\n\nWe would love to see you at our event. Please let us know if you will attend.'},{id:'i-event',type:'event_details'},{id:'i-response',type:'invitation_response'},{id:'i-footer',type:'footer'}]}},
];

export function blankCampaignDesign(type = 'event_notification') {
  const template = CAMPAIGN_WORKSPACE_TEMPLATE_SEED.find(item=>item.campaign_type===type);
  return template ? JSON.parse(JSON.stringify(template.design)) : { version: 1, blocks: defaultBlocks() };
}
