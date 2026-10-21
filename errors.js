// Maps error codes raised by the database to clear messages. Raw database text is never shown.
const MESSAGES = {
  auth_required: 'Please sign in to do that.',
  email_not_verified: 'Please verify your email address first. Check your inbox.',
  account_suspended: 'Your account is restricted. Please contact the administrators.',
  profile_missing: 'Your profile could not be found. Please sign out and sign in again.',
  daily_chat_limit_reached: 'You have used your main-chat messages for today.',
  daily_book_chat_limit_reached: 'You have reached today\'s limit for book discussions.',
  message_length_invalid: 'Messages must be between 1 and 1000 characters.',
  comment_length_invalid: 'Comments must be between 1 and 2000 characters.',
  chapter_not_available: 'This chapter is not available to you.',
  book_not_available: 'This book is not available.',
  author_not_found: 'This author could not be found.',
  cannot_follow_self: 'You cannot follow yourself.',
  username_mismatch: 'The username must match your Vortex username exactly.',
  order_reference_already_submitted: 'That Ko-fi order reference has already been submitted.',
  order_reference_invalid: 'Please enter a valid Ko-fi order reference.',
  unknown_package: 'Please choose one of the four Premium packages.',
  insufficient_coins: 'You do not have enough coins for that.',
  unsupported_spend: 'That purchase is not available right now.',
  invalid_request_key: 'Something went wrong with that request. Please try again.',
  invalid_shelf: 'Please choose a valid shelf.',
  author_only: 'Only authors with an approved book can add support links.',
  invalid_provider: 'Please choose PayPal, Ko-fi, or Patreon.',
  support_link_invalid: 'That link does not look like a valid PayPal, Ko-fi, or Patreon address.',
  reason_required: 'Please enter a reason.',
  forbidden: 'You do not have permission to do that.',
  user_not_found: 'That member could not be found.',
  not_found: 'That item could not be found.',
  already_reviewed: 'This has already been reviewed.',
  invalid_status: 'That status is not valid.',
  unknown_target_type: 'That type of content cannot be reported or moderated here.',
  designated_admin_entitlement_is_protected: 'The designated administrator entitlement cannot be revoked here.',
  designated_admin_cannot_delete: 'The designated administrator account cannot be deleted.',
  cannot_suspend_self: 'You cannot suspend your own account.',
  cannot_suspend_admin: 'Administrator accounts cannot be suspended.',
  confirmation_required: 'Please type DELETE to confirm.',
  account_has_books: 'Your account has books, so it cannot be deleted yet. Contact the administrators.',
  account_has_purchases: 'Your account has purchase history, so it cannot be deleted yet. Contact the administrators.',
  account_has_coin_history: 'Your account has coin history, so it cannot be deleted yet. Contact the administrators.',
  'book must be approved': 'Chapters can be published only after the book is approved.',
  'author cannot be changed': 'That change is not allowed.',
  'status change not permitted': 'That status change is not allowed.',
  'review reason is set by administrators': 'Only administrators can set a review reason.',
};

// Longer keys are checked first so that, for example, "user_not_found" is not read as "not_found".
const KEYS = Object.keys(MESSAGES).sort((a, b) => b.length - a.length);

export function friendly(error) {
  const text = typeof error === 'string' ? error : error?.message ?? '';
  const key = KEYS.find((k) => text.includes(k));
  return key ? MESSAGES[key] : 'Something went wrong. Please try again.';
}
