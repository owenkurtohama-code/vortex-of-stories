import { supabase } from './supabase';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const LIMITS = { avatars: 2 * 1024 * 1024, covers: 5 * 1024 * 1024 };
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Returns a message for the member, or null when the file is acceptable.
export function checkImage(file, bucket) {
  if (!file) return 'Please choose an image first.';
  if (!ALLOWED.includes(file.type)) return 'Please use a JPG, PNG or WebP image.';
  if (file.size > LIMITS[bucket]) return `That image is too large. The maximum is ${LIMITS[bucket] / (1024 * 1024)} MB.`;
  return null;
}

// Stores the file in the member's own folder and returns its public address.
export async function uploadImage(bucket, userId, name, file) {
  const path = `${userId}/${name}-${Date.now()}.${EXT[file.type]}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
