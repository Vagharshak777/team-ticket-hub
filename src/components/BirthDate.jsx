import React from "react";
import { latestBirthDate } from "../lib/dates.js";

export default function BirthDate({ value }) {
  return (
    <label>
      Date of birth
      <input
        className="clr-input"
        name="birthDate"
        type="date"
        defaultValue={value}
        max={latestBirthDate()}
        required
      />
      <span className="hint">You must be at least 18 years old.</span>
    </label>
  );
}
