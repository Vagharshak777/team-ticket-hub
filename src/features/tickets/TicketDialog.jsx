import React, { useEffect, useRef, useState } from "react";

export default function TicketDialog({
  ticket,
  user,
  users = [],
  onClose,
  onSave,
  onDelete,
}) {
  const dialog = useRef(null);
  const canManage = user?.role === "manager";
  const canEdit = !ticket || canManage || ticket.ownerId === user?.id;
  const [checklist, setChecklist] = useState(
    ticket?.checklist.map((item) => ({ ...item })) || [
      { text: "", done: false },
    ],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
    dialog.current.querySelector('input[name="name"]').focus();
  }, []);
  async function submit(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      await onSave({
        name: canEdit ? fields.name : ticket.name,
        task: canEdit ? fields.task : ticket.task,
        checklist,
        ...(canManage
          ? { assigneeId: fields.assigneeId ? Number(fields.assigneeId) : null }
          : {}),
      });
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm("Delete this ticket?")) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(ticket.id);
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  function changeStep(index, field, value) {
    setChecklist((current) =>
      current.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="ticket-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current && !busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="ticket-dialog-title">
          {ticket ? "Edit ticket" : "New ticket"}
        </h2>
        <button
          className="btn btn-outline btn-sm"
          type="button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <form className="form-stack" onSubmit={submit}>
        <fieldset disabled={busy} className="form-fields">
          <label>
            Ticket name
            <input
              className="clr-input"
              name="name"
              readOnly={!canEdit}
              defaultValue={ticket?.name || ""}
              maxLength={100}
              required
            />
          </label>
          <label>
            Task
            <textarea
              className="clr-textarea"
              name="task"
              readOnly={!canEdit}
              defaultValue={ticket?.task || ""}
              rows={3}
              maxLength={5000}
              required
            />
          </label>
          {canManage && (
            <label>
              Assign to employee
              <select
                name="assigneeId"
                className="clr-select"
                defaultValue={ticket?.assigneeId || ""}
              >
                <option value="">Unassigned</option>
                {users
                  .filter((member) => member.role === "employee")
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.email})
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div>
            <div className="checklist-heading">
              <span>Checklist</span>
              <span className="hint">{checklist.length}/50 steps</span>
            </div>
            <div className="checklist-editor">
              {checklist.map((item, index) => (
                <div className="step-row" key={index}>
                  <input
                    type="checkbox"
                    aria-label={`Step ${index + 1} completed`}
                    checked={item.done}
                    onChange={(event) =>
                      changeStep(index, "done", event.target.checked)
                    }
                  />
                  <input
                    className="clr-input"
                    aria-label={`Step ${index + 1}`}
                    placeholder={`Step ${index + 1}`}
                    value={item.text}
                    readOnly={!canEdit}
                    required
                    maxLength={200}
                    onChange={(event) =>
                      changeStep(index, "text", event.target.value)
                    }
                  />
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    aria-label={`Remove step ${index + 1}`}
                    disabled={!canEdit || checklist.length === 1 || busy}
                    onClick={() =>
                      setChecklist(checklist.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-link"
              disabled={!canEdit || checklist.length >= 50 || busy}
              onClick={() =>
                setChecklist([...checklist, { text: "", done: false }])
              }
            >
              Add step
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <div className="dialog-footer">
          {ticket && canEdit && (
            <button
              type="button"
              className="btn btn-danger-outline"
              disabled={busy}
              onClick={remove}
            >
              Delete ticket
            </button>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving..." : ticket ? "Save changes" : "Create ticket"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
