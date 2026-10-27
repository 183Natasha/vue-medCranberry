/**
 * users.serializer.mjs — единственное место, где db-запись пользователя (snake_case,
 * с секретными полями password_hash/salt) превращается в API-представление (camelCase,
 * без секретов). Новое поле пользователя добавляется здесь + в клиентском маппере.
 *
 * Формат API (единый для всех ручек: login, session, POST/PUT /api/users):
 *   { id, username, role, fullName, birthDate, email, mustChangePassword }
 */

/** db-пользователь → API-вид (без password_hash/salt). */
export function toApiUser(dbUser) {
  return {
    id: dbUser.id,
    username: dbUser.username,
    role: dbUser.role,
    fullName: dbUser.full_name,
    birthDate: dbUser.birth_date ?? null,
    email: dbUser.email ?? null,
    mustChangePassword: !!dbUser.must_change_password,
  }
}

/** Активная сессия → API-вид пользователя (те же поля, что у toApiUser). */
export function sessionToApiUser(session) {
  return {
    id: session.userId,
    username: session.username,
    role: session.role,
    fullName: session.full_name,
    birthDate: session.birth_date ?? null,
    email: session.email ?? null,
    mustChangePassword: !!session.must_change_password,
  }
}
