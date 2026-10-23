export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function readText(value, label, maximum) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  ) {
    throw new InputError(`${label} must contain 1 to ${maximum} characters.`);
  }
  return value.trim();
}

function readEmail(value) {
  const email = readText(value, "Email address", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new InputError("Please enter a valid email address.");
  return email;
}

// Check the age on the server too.
function readBirthDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new InputError("Please enter a valid date of birth.");
  const birth = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== value ||
    value.startsWith("0000")
  ) {
    throw new InputError("Please enter a valid date of birth.");
  }
  const today = new Date();
  let age = today.getFullYear() - birth.getUTCFullYear();
  if (
    today.getMonth() < birth.getUTCMonth() ||
    (today.getMonth() === birth.getUTCMonth() &&
      today.getDate() < birth.getUTCDate())
  )
    age--;
  if (age < 18) throw new InputError("You must be at least 18 years old.");
  return value;
}

export function readProfile(body) {
  return {
    name: readText(body?.name, "Name", 100),
    email: readEmail(body?.email),
    birthDate: readBirthDate(body?.birthDate),
  };
}

export function readTicket(body) {
  const name = readText(body?.name, "Ticket name", 100);
  const task = readText(body?.task, "Task", 5000);
  if (
    !Array.isArray(body?.checklist) ||
    body.checklist.length < 1 ||
    body.checklist.length > 50
  )
    throw new InputError("The checklist must have 1 to 50 steps.");
  const checklist = body.checklist.map((item) => {
    if (typeof item?.done !== "boolean")
      throw new InputError("Each step needs a valid status.");
    return {
      text: readText(item.text, "Checklist step", 200),
      done: item.done,
    };
  });
  return { name, task, checklist };
}
