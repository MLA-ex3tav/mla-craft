import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { unit?: string };

/** Shared numeric treatment; callers retain their own validation and value handling. */
export default function NumberField({ unit, className, ...input }: Props) {
  return <span className="number-field">
    <input {...input} type="number" className={className} />
    {unit && <span className="number-field-unit">{unit}</span>}
  </span>;
}
