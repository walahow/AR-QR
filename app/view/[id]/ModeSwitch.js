"use client";

export default function ModeSwitch({ value, onChange, options }) {
  return (
    <div className="frame" style={{ display: "inline-flex" }}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          style={{
            border: "none",
            borderRight: i < options.length - 1 ? "4px solid #000" : "none",
            background: value === opt.value ? "#000" : "#fff",
            color: value === opt.value ? "#fff" : "#000",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
