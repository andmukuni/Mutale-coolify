import { GROWING_PEOPLE_BLOCK_TYPES } from '../../../../shared/emailDesignCompile.js';

const TYPE_ATTR = 'data-mm-type';

function blockDefaults(type) {
  switch (type) {
    case 'header':
      return '<div data-mm-type="header" style="background:#141D45;color:#fff;padding:18px 22px;font-weight:800">MUTALE <span style="color:#00A79D">MUBANGA</span><div style="font-size:12px;font-weight:500">Growing People.</div></div>';
    case 'heading':
      return '<h1 data-mm-type="heading">{{event_title}}</h1>';
    case 'text':
      return '<p data-mm-type="text">Hi {{first_name}}, we have an update for you.</p>';
    case 'image':
      return '<img data-mm-type="image" alt="Image" src="https://mutalemubanga.org/logo.png" style="max-width:100%" />';
    case 'button':
      return '<a data-mm-type="button" href="{{resource_page_url}}" style="display:inline-block;background:#00A79D;color:#fff;padding:10px 16px;text-decoration:none;border-radius:8px">Open</a>';
    case 'divider':
      return '<hr data-mm-type="divider" />';
    case 'spacer':
      return '<div data-mm-type="spacer" style="height:18px">&nbsp;</div>';
    case 'columns':
      return '<table data-mm-type="columns" width="100%"><tr><td>Column one</td><td>Column two</td></tr></table>';
    case 'event_details':
      return '<div data-mm-type="event_details" style="background:#eef6f6;padding:14px">{{event_title}}<br/>{{event_when}}<br/>{{venue_or_join}}</div>';
    case 'resource_card':
      return '<div data-mm-type="resource_card" data-mm-title="Event resource">Event workbook — download from your resource page.</div>';
    case 'footer':
      return '<p data-mm-type="footer" style="font-size:12px;color:#5b6573">Mutale Mubanga · Growing People.</p>';
    default:
      return `<div data-mm-type="${type}"></div>`;
  }
}

export function grapesCampaignPlugin(editor) {
  GROWING_PEOPLE_BLOCK_TYPES.forEach((item) => {
    editor.DomComponents.addType(`mm-${item.type}`, {
      isComponent: (el) => el?.getAttribute?.(TYPE_ATTR) === item.type,
      model: {
        defaults: {
          attributes: { [TYPE_ATTR]: item.type },
        },
      },
    });
    editor.BlockManager.add(`mm-${item.type}`, {
      label: item.label,
      category: 'Growing People',
      content: blockDefaults(item.type),
    });
  });
}

export function grapesToBlocks(editor) {
  if (!editor) return [];
  const wrapper = editor.getWrapper?.();
  const children = wrapper?.components?.() || [];
  const blocks = [];
  children.forEach((component, index) => {
    const attrs = component.getAttributes?.() || {};
    const type = attrs[TYPE_ATTR] || inferType(component);
    const text = String(component.get('content') || component.toHTML?.() || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    blocks.push({
      id: `gjs-${index}`,
      type,
      text: type === 'heading' || type === 'text' ? (component.get('content') || text) : text,
      label: type === 'button' ? (component.get('content') || 'Open') : '',
      url: attrs.href || component.getAttributes?.().href || '',
      src: attrs.src || '',
      alt: attrs.alt || '',
      resource_title: attrs['data-mm-title'] || '',
      columns: type === 'columns' ? ['Column one', 'Column two'] : ['', ''],
    });
  });
  return blocks;
}

function inferType(component) {
  const tag = String(component.get('tagName') || '').toLowerCase();
  if (tag === 'h1' || tag === 'h2') return 'heading';
  if (tag === 'img') return 'image';
  if (tag === 'a') return 'button';
  if (tag === 'hr') return 'divider';
  return 'text';
}

export function designToGrapesComponents(design) {
  const blocks = Array.isArray(design?.blocks) ? design.blocks : [];
  return blocks.map((block) => blockDefaults(block.type)).join('');
}
