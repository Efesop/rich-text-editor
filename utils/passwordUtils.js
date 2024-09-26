import bcrypt from 'bcryptjs'

export async function hashPassword(password) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password, hashedPassword) {
  if (typeof password !== 'string') {
    throw new Error(`Invalid password format: expected string, got ${typeof password}`)
  }
  if (typeof hashedPassword !== 'string') {
    throw new Error(`Invalid hashed password format: expected string, got ${typeof hashedPassword}`)
  }
  return bcrypt.compare(password, hashedPassword)
}
