import type { CoinFields } from '../lib/api'

type Props<T extends CoinFields> = {
  fields: T
  onChange: (fields: T) => void
}

// Shared "Physical details" + "AI estimate" field groups used on both the
// capture review step and the coin detail edit form — AI extraction
// pre-fills these, but every field stays manually editable.
export function CoinExtraFields<T extends CoinFields>({ fields, onChange }: Props<T>) {
  return (
    <>
      <fieldset className="field-group">
        <legend>Physical details</legend>
        <label>
          Composition
          <input
            value={fields.composition ?? ''}
            onChange={(e) => onChange({ ...fields, composition: e.target.value || null })}
          />
        </label>
        <label>
          Weight (grams)
          <input
            type="number"
            step="any"
            value={fields.weight_grams ?? ''}
            onChange={(e) => onChange({ ...fields, weight_grams: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label>
          Diameter (mm)
          <input
            type="number"
            step="any"
            value={fields.diameter_mm ?? ''}
            onChange={(e) => onChange({ ...fields, diameter_mm: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label>
          Thickness (mm)
          <input
            type="number"
            step="any"
            value={fields.thickness_mm ?? ''}
            onChange={(e) => onChange({ ...fields, thickness_mm: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label>
          Shape
          <input value={fields.shape ?? ''} onChange={(e) => onChange({ ...fields, shape: e.target.value || null })} />
        </label>
        <label>
          Orientation
          <input
            value={fields.orientation ?? ''}
            onChange={(e) => onChange({ ...fields, orientation: e.target.value || null })}
          />
        </label>
        <label>
          Value
          <input
            type="number"
            step="any"
            value={fields.value ?? ''}
            onChange={(e) => onChange({ ...fields, value: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label>
          Currency
          <input value={fields.currency ?? ''} onChange={(e) => onChange({ ...fields, currency: e.target.value || null })} />
        </label>
        <label>
          Period
          <input value={fields.period ?? ''} onChange={(e) => onChange({ ...fields, period: e.target.value || null })} />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={fields.demonetized}
            onChange={(e) => onChange({ ...fields, demonetized: e.target.checked })}
          />
          Demonetized
        </label>
      </fieldset>

      <fieldset className="field-group">
        <legend>AI estimate</legend>
        <label>
          Rarity
          <input value={fields.rarity ?? ''} onChange={(e) => onChange({ ...fields, rarity: e.target.value || null })} />
        </label>
        <label>
          Grade
          <input value={fields.grade ?? ''} onChange={(e) => onChange({ ...fields, grade: e.target.value || null })} />
        </label>
        <label>
          Estimated value low (USD)
          <input
            type="number"
            step="any"
            value={fields.estimated_value_low ?? ''}
            onChange={(e) =>
              onChange({ ...fields, estimated_value_low: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        <label>
          Estimated value high (USD)
          <input
            type="number"
            step="any"
            value={fields.estimated_value_high ?? ''}
            onChange={(e) =>
              onChange({ ...fields, estimated_value_high: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
      </fieldset>
    </>
  )
}
