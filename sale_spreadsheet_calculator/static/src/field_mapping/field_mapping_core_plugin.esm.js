import {CommandResult, helpers} from "@odoo/o-spreadsheet";
import {OdooCorePlugin} from "@spreadsheet/plugins";

const {positionToZone, toCartesian, toXC} = helpers;

export class FieldMappingCorePlugin extends OdooCorePlugin {
    static getters = [
        "getAllFieldMappings",
        "getFieldMapping",
        "getFieldMappingsInZone",
        "getMappingLineLabel",
        "getSaleCalculatorContext",
        "getSaleResId",
    ];

    fieldMappings = {};

    constructor(config) {
        super(config);
        // Sale context (target order id, mappable line labels, whether this
        // spreadsheet is a calculator). Transient: never exported.
        //
        // Tests inject it directly via custom.saleContext. In the app it is
        // resolved here from the spreadsheet id published on the env by the
        // ActionSpreadsheetOca patch, using the raw (non component-bound) ORM so
        // a late resolution after the editor closes cannot crash. The object
        // reference is stable and filled in once the lookup resolves.
        const custom = config.custom || {};
        const env = custom.env;
        this.saleContext = custom.saleContext || {
            isCalculator: false,
            orderId: false,
            lines: [],
        };
        this.saleResId = custom.saleResId || env?.saleResId || false;
        const orm = env?.services?.orm || custom.orm;
        if (!custom.saleContext && this.saleResId && orm) {
            orm.call("spreadsheet.spreadsheet", "get_sale_calculator_context", [
                [this.saleResId],
            ])
                .then((context) => Object.assign(this.saleContext, context))
                .catch(() => {});
        }
    }

    getSaleCalculatorContext() {
        return this.saleContext;
    }

    getSaleResId() {
        return this.saleResId;
    }

    getMappingLineLabel(position) {
        return (
            this.saleContext.lines.find((line) => line.position === position)?.label ||
            ""
        );
    }

    allowDispatch(cmd) {
        switch (cmd.type) {
            case "MAP_FIELD": {
                const current = this.getFieldMapping(cmd);
                if (
                    current &&
                    current.position === cmd.position &&
                    current.fieldName === cmd.fieldName
                ) {
                    return CommandResult.NoChanges;
                }
                break;
            }
            case "UNMAP_FIELDS":
                if (this.getFieldMappingsInZone(cmd.sheetId, cmd.zone).length === 0) {
                    return CommandResult.NoChanges;
                }
                break;
        }
        return CommandResult.Success;
    }

    handle(cmd) {
        switch (cmd.type) {
            case "MAP_FIELD":
                this.history.update("fieldMappings", cmd.sheetId, cmd.col, cmd.row, {
                    position: Math.max(1, cmd.position),
                    fieldName: cmd.fieldName,
                });
                break;
            case "UNMAP_FIELDS":
                for (let col = cmd.zone.left; col <= cmd.zone.right; col++) {
                    for (let row = cmd.zone.top; row <= cmd.zone.bottom; row++) {
                        this.history.update(
                            "fieldMappings",
                            cmd.sheetId,
                            col,
                            row,
                            undefined
                        );
                    }
                }
                break;
        }
    }

    adaptRanges({applyChange}) {
        const removed = [];
        const moved = [];
        for (const [position, fieldMapping] of this.getAllFieldMappings()) {
            const change = applyChange(
                this.getters.getRangeFromZone(
                    position.sheetId,
                    positionToZone(position)
                )
            );
            if (change.changeType === "REMOVE") {
                removed.push(position);
            } else if (change.changeType !== "NONE") {
                removed.push(position);
                moved.push([
                    {
                        sheetId: position.sheetId,
                        col: change.range.zone.left,
                        row: change.range.zone.top,
                    },
                    fieldMapping,
                ]);
            }
        }
        for (const {sheetId, col, row} of removed) {
            this.history.update("fieldMappings", sheetId, col, row, undefined);
        }
        for (const [{sheetId, col, row}, fieldMapping] of moved) {
            this.history.update("fieldMappings", sheetId, col, row, fieldMapping);
        }
    }

    getFieldMapping({sheetId, col, row}) {
        return this.fieldMappings[sheetId]?.[col]?.[row];
    }

    getAllFieldMappings() {
        const result = new Map();
        for (const sheetId in this.fieldMappings) {
            for (const col in this.fieldMappings[sheetId]) {
                for (const row in this.fieldMappings[sheetId][col]) {
                    const fieldMapping = this.fieldMappings[sheetId][col][row];
                    if (fieldMapping) {
                        result.set(
                            {sheetId, col: Number(col), row: Number(row)},
                            fieldMapping
                        );
                    }
                }
            }
        }
        return result;
    }

    getFieldMappingsInZone(sheetId, zone) {
        const result = [];
        for (let col = zone.left; col <= zone.right; col++) {
            for (let row = zone.top; row <= zone.bottom; row++) {
                const fieldMapping = this.getFieldMapping({sheetId, col, row});
                if (fieldMapping) {
                    result.push(fieldMapping);
                }
            }
        }
        return result;
    }

    export(data) {
        for (const [position, fieldMapping] of this.getAllFieldMappings()) {
            const sheet = data.sheets.find((s) => s.id === position.sheetId);
            if (!sheet) {
                continue;
            }
            sheet.fieldMappings ??= {};
            sheet.fieldMappings[toXC(position.col, position.row)] = fieldMapping;
        }
    }

    import(data) {
        for (const sheet of data.sheets) {
            if (!sheet.fieldMappings) {
                continue;
            }
            for (const [xc, fieldMapping] of Object.entries(sheet.fieldMappings)) {
                const {col, row} = toCartesian(xc);
                this.history.update("fieldMappings", sheet.id, col, row, fieldMapping);
            }
        }
    }
}
