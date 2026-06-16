/**
 * Curated lucide icons that admins can pick from when creating a product type.
 *
 * The catalogue is intentionally small and product-shop relevant — keeping it
 * curated avoids "unknown icon" rendering issues and lets us guarantee the
 * resolver always returns a renderable component.
 */
import {
  Book,
  Shirt,
  Coffee,
  Tag,
  Box,
  Package,
  Gift,
  Sparkles,
  Watch,
  ShoppingBag,
  Sticker,
  Headphones,
  Star,
  Award,
  Image as ImageIcon,
  PenTool,
  Glasses,
  Footprints,
  Music,
  Camera,
  Wallet,
  Briefcase,
  Heart,
} from 'lucide-react';

// Icon choices. The order here drives the dropdown order in the admin form.
export const PRODUCT_TYPE_ICON_CHOICES = [
  { value: 'book',         label: 'Book',          Icon: Book },
  { value: 'shirt',        label: 'Shirt',         Icon: Shirt },
  { value: 'coffee',       label: 'Coffee / Mug',  Icon: Coffee },
  { value: 'tag',          label: 'Tag',           Icon: Tag },
  { value: 'box',          label: 'Box',           Icon: Box },
  { value: 'package',      label: 'Package',       Icon: Package },
  { value: 'gift',         label: 'Gift',          Icon: Gift },
  { value: 'sparkles',     label: 'Sparkles',      Icon: Sparkles },
  { value: 'watch',        label: 'Watch',         Icon: Watch },
  { value: 'shopping-bag', label: 'Shopping Bag',  Icon: ShoppingBag },
  { value: 'sticker',      label: 'Sticker',       Icon: Sticker },
  { value: 'headphones',   label: 'Headphones',    Icon: Headphones },
  { value: 'star',         label: 'Star',          Icon: Star },
  { value: 'award',        label: 'Award',         Icon: Award },
  { value: 'image',        label: 'Image / Print', Icon: ImageIcon },
  { value: 'pen-tool',     label: 'Stationery',    Icon: PenTool },
  { value: 'glasses',      label: 'Glasses',       Icon: Glasses },
  { value: 'footprints',   label: 'Footwear',      Icon: Footprints },
  { value: 'music',        label: 'Music',         Icon: Music },
  { value: 'camera',       label: 'Camera',        Icon: Camera },
  { value: 'wallet',       label: 'Wallet',        Icon: Wallet },
  { value: 'briefcase',    label: 'Briefcase',     Icon: Briefcase },
  { value: 'heart',        label: 'Heart',         Icon: Heart },
];

const ICON_MAP = PRODUCT_TYPE_ICON_CHOICES.reduce((acc, entry) => {
  acc[entry.value] = entry.Icon;
  return acc;
}, {});

/**
 * Resolve a stored icon name (string) to a lucide-react component. Falls back
 * to the generic Box icon when the name is unknown or empty.
 *
 * @param {string} iconName
 * @returns {import('lucide-react').LucideIcon}
 */
export function getProductTypeIcon(iconName) {
  const key = String(iconName || '').trim().toLowerCase();
  return ICON_MAP[key] || Box;
}

export function isKnownProductTypeIcon(iconName) {
  const key = String(iconName || '').trim().toLowerCase();
  return Boolean(ICON_MAP[key]);
}
