export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (username.length < 3) return { valid: false, error: 'Username must be at least 3 characters' };
  if (username.length > 32) return { valid: false, error: 'Username must be 32 characters or less' };
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
  if (password.length > 128) return { valid: false, error: 'Password must be 128 characters or less' };
  if (!/[A-Z]/.test(password)) return { valid: false, error: 'Password must contain at least one uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, error: 'Password must contain at least one lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, error: 'Password must contain at least one number' };
  return { valid: true };
}

export function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, '').trim().slice(0, 2000);
}
