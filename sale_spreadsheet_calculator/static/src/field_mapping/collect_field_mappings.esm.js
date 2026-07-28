import {_t} from "@web/core/l10n/translation";

/**
 * Read the current field mappings out of the spreadsheet model.
 *
 * Returns ``{mappings, errors}`` where each mapping is
 * ``{key, ref, position, field, value}`` (``value`` is ``null`` for an empty
 * cell) and ``errors`` reports cells that target the same field of the same
 * line. Cells evaluating to an error are skipped.
 */
export function collectFieldMappings(model) {
    const mappings = [];
    const seen = {};
    const duplicates = new Set();
    for (const [cellPosition, fieldMapping] of model.getters.getAllFieldMappings()) {
        const cell = model.getters.getEvaluatedCell(cellPosition);
        if (cell && cell.type === "error") {
            continue;
        }
        const isEmpty = !cell || cell.type === "empty" || cell.value === "";
        const key = `${fieldMapping.position}/${fieldMapping.fieldName}`;
        const ref = model.getters.getRangeString(
            model.getters.getRangeFromZone(cellPosition.sheetId, {
                left: cellPosition.col,
                right: cellPosition.col,
                top: cellPosition.row,
                bottom: cellPosition.row,
            }),
            cellPosition.sheetId
        );
        if (seen[key]) {
            duplicates.add(key);
        }
        seen[key] = ref;
        mappings.push({
            key,
            ref,
            position: fieldMapping.position,
            field: fieldMapping.fieldName,
            value: isEmpty ? null : cell.value,
        });
    }
    const errors = [...duplicates].map((key) => {
        const refs = mappings.filter((m) => m.key === key).map((m) => m.ref);
        return _t(
            "Several cells target the same field of the same line: %s",
            refs.join(", ")
        );
    });
    return {mappings, errors};
}
