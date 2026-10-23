export function createUserRepository(database) {
  return {
    findById(id) {
      return database.prepare("SELECT * FROM users WHERE id = ?").get(id);
    },
    findByEmail(email) {
      return database.prepare("SELECT * FROM users WHERE email = ?").get(email);
    },
    create(profile, passwordHash) {
      const result = database
        .prepare(
          "INSERT INTO users (name, email, birth_date, password_hash) VALUES (?, ?, ?, ?)",
        )
        .run(profile.name, profile.email, profile.birthDate, passwordHash);
      return this.findById(result.lastInsertRowid);
    },
    update(id, profile) {
      database
        .prepare(
          "UPDATE users SET name = ?, email = ?, birth_date = ? WHERE id = ?",
        )
        .run(profile.name, profile.email, profile.birthDate, id);
      return this.findById(id);
    },
  };
}
