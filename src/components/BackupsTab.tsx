import NumberField from "./NumberField";
import { useSectionSearch, matchesSearch } from "../lib/sectionSearch";
import { useEffect, useState } from "react";
import { Archive, Loader2, Save, Trash2, Clock3, RotateCw, Layers3 } from "lucide-react";
import {
  createBackup,
  deleteBackup,
  errorMessage,
  listBackups,
  updateSchedule,
} from "../lib/api";
import type { BackupEntry, Instance } from "../lib/types";
import { cx } from "../lib/cx";

import { EmptyPanel } from "./SectionUI";

interface Props {
  instance: Instance;
  onUpdated: (instance: Instance) => void;
}

function BackupsTab({ instance, onUpdated }: Props) {
  const { query } = useSectionSearch();
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [backupInterval, setBackupInterval] = useState(
    instance.backupIntervalMinutes ?? 0,
  );
  const [retention, setRetention] = useState(instance.backupRetention ?? 5);
  const [restartInterval, setRestartInterval] = useState(
    instance.restartIntervalMinutes ?? 0,
  );
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      setBackups(await listBackups(instance.id));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [instance.id]);

  async function create() {
    setCreating(true);
    setError("");
    setStatus("");
    try {
      await createBackup(instance.id);
      await refresh();
      setStatus("Backup creado.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function remove(entry: BackupEntry) {
    try {
      await deleteBackup(instance.id, entry.name);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function saveSchedule() {
    if (![backupInterval, retention, restartInterval].every((value) => Number.isInteger(value) && value >= 0 && value <= 4294967295)) {
      setError("Introduce números enteros positivos o 0 para usar la opción predeterminada.");
      return;
    }
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const updated = await updateSchedule(instance.id, {
        backupIntervalMinutes: backupInterval > 0 ? backupInterval : null,
        backupRetention: retention > 0 ? retention : null,
        restartIntervalMinutes: restartInterval > 0 ? restartInterval : null,
      });
      onUpdated(updated);
      setRetention(updated.backupRetention ?? 5);
      setStatus("Programación guardada.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const visibleBackups = backups.filter((entry) => matchesSearch(`${entry.name} ${entry.created}`, query));
  return (
    <div className="inner-page page-enter space-y-6">
      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {status && (
        <div className="rounded-lg border border-accent/40 bg-accent-soft px-4 py-2 text-sm text-accent">
          {status}
        </div>
      )}

      <section>
        <div className="list-toolbar">
          <h2 className="text-sm font-semibold">Copias de seguridad</h2>
          <button
            type="button"
            onClick={create}
            disabled={creating || !instance.installed}
            className={cx(
              "flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:bg-accent-strong disabled:opacity-50",
            )}
          >
            {creating ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Archive size={13} />
            )}
            Crear backup
          </button>
        </div>

        <div className="section-card-grid">
          {loading ? (
            <div className="flex justify-center py-6 text-muted">
              <Loader2 className="animate-spin" />
            </div>
          ) : visibleBackups.length === 0 ? (
            <EmptyPanel icon={Archive} title={query ? "Sin copias coincidentes" : "Tu primera copia, tu próximo paso"} description={query ? "Prueba con otro nombre o fecha." : "Crea un backup para conservar el estado actual de tu mundo antes de hacer cambios."} />
          ) : (
            visibleBackups.map((entry) => (
              <div
                key={entry.name}
                className="section-item-card backup-file-card"
              >
                <div className="section-card-top"><span className="row-icon"><Archive size={21} /></span><span className="section-card-tag">Backup</span></div><div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{entry.name}</div>
                  <div className="text-[11px] text-muted">
                    {entry.created}
                  </div>
                </div>
                <footer className="section-card-footer"><span className="backup-file-size"><strong>{(entry.size / 1024 / 1024).toFixed(1)}</strong> MB</span>
                <button
                  type="button"
                  aria-label={`Eliminar copia ${entry.name}`}
                  onClick={() => remove(entry)}
                  className="rounded-lg border border-border p-1.5 text-muted hover:border-danger/50 hover:text-danger"
                >
                  <Trash2 size={14} />
                </button></footer>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="list-toolbar">
          <div className="section-title"><Clock3 size={20} /><div><h2>Programación automática</h2><p>Define cuándo guardar copias y reiniciar.</p></div></div>
          <button
            type="button"
            onClick={saveSchedule}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:bg-accent-strong"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            Guardar
          </button>
        </div>
        <fieldset disabled={saving} className="backup-schedule-grid">
          {[
            { key: "interval", label: "Copias automáticas", icon: Clock3, value: backupInterval, change: setBackupInterval, unit: "minutos", hint: backupInterval > 0 ? `Una copia cada ${backupInterval} minutos.` : "Desactivadas · establece un intervalo para activarlas.", presets: [0, 30, 60, 120] },
            { key: "retention", label: "Copias a conservar", icon: Layers3, value: retention, change: setRetention, unit: "copias", hint: retention > 0 ? "Las copias más antiguas se eliminan al superar este límite." : "Se usará el valor predeterminado: 5 copias.", presets: [5, 10, 20] },
            { key: "restart", label: "Reinicio automático", icon: RotateCw, value: restartInterval, change: setRestartInterval, unit: "minutos", hint: restartInterval > 0 ? `Reiniciar cada ${restartInterval} minutos.` : "Desactivado · el servidor no se reiniciará por horario.", presets: [0, 60, 360, 720] },
          ].map(({ key, label, icon: Icon, value, change, unit, hint, presets }) => (
            <div className="backup-schedule-card" key={key}>
              <label htmlFor={`backup-${key}`} className="backup-schedule-label"><Icon size={19} />{label}</label>
              <div className="backup-number-field">
                <NumberField id={`backup-${key}`} min={0} max={4294967295} step={1} value={value} unit={unit}
                  aria-describedby={`backup-${key}-hint`} onChange={(event) => change(Number(event.target.value))} />
              </div>
              <div className="backup-presets" role="group" aria-label={`Valores rápidos: ${label}`}>
                {presets.map((preset) => <button type="button" key={preset} aria-pressed={value === preset}
                  onClick={() => change(preset)}>{preset === 0 ? "Desactivar" : `${preset} ${unit}`}</button>)}
              </div>
              <p id={`backup-${key}-hint`}>{hint}</p>
            </div>
          ))}
        </fieldset>
        <p className="mt-2 text-[11px] text-muted">
          Usa 0 para desactivar un intervalo. Los backups programados solo se crean con el servidor detenido. El
          reinicio programado detiene y vuelve a iniciar el servidor.
        </p>
      </section>
    </div>
  );
}

export default BackupsTab;
