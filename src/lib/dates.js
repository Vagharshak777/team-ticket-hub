export function latestBirthDate() {
  const date = new Date();
  const month = date.getMonth();
  date.setFullYear(date.getFullYear() - 18);
  if (date.getMonth() !== month) date.setDate(0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
