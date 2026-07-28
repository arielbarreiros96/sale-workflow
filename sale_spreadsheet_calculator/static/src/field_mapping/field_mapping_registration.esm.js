import {coreTypes, registries} from "@odoo/o-spreadsheet";
import {FieldMappingCorePlugin} from "./field_mapping_core_plugin.esm";
import {FieldMappingSidePanel} from "./field_mapping_side_panel.esm";
import {collectFieldMappings} from "./collect_field_mappings.esm";
import {_t} from "@web/core/l10n/translation";

const {
    corePluginRegistry,
    sidePanelRegistry,
    cellMenuRegistry,
    topbarMenuRegistry,
    inverseCommandRegistry,
} = registries;

coreTypes.add("MAP_FIELD").add("UNMAP_FIELDS");

const identity = (cmd) => cmd;

/** Whether the open spreadsheet is a sale quote calculator. */
function isCalculator(env) {
    return Boolean(env.model.getters.getSaleCalculatorContext?.()?.isCalculator);
}

async function writeToOrder(env) {
    const {mappings, errors} = collectFieldMappings(env.model);
    if (errors.length) {
        env.raiseError(errors.join("\n\n"));
        return;
    }
    const resId = env.model.getters.getSaleResId();
    const result = await env.services.orm.call(
        "spreadsheet.spreadsheet",
        "write_field_mappings_to_order",
        [
            [resId],
            mappings.map(({position, field, value}) => ({position, field, value})),
        ]
    );
    env.notifyUser({
        text: _t("Updated %s order line(s) from the calculator.", result.updated),
        type: "success",
        sticky: false,
    });
    env.services.action.doAction({type: "ir.actions.act_window_close"});
}

// The field-mapping feature lives in the shared spreadsheet.o_spreadsheet
// bundle, so it is registered once for every OCA spreadsheet editor. The menus
// stay hidden unless the spreadsheet is actually a sale calculator, and the
// core command types are registered up front so collaborative revisions replay
// correctly for every client that joins.
corePluginRegistry.add("sale_field_mapping", FieldMappingCorePlugin);
inverseCommandRegistry.add("MAP_FIELD", identity);
inverseCommandRegistry.add("UNMAP_FIELDS", identity);

sidePanelRegistry.add("SaleFieldMappingPanel", {
    title: _t("Map to field"),
    Body: FieldMappingSidePanel,
    computeState(getters, initialProps) {
        const position = getters.getActivePosition();
        return {
            isOpen: Boolean(getters.getFieldMapping?.(position)),
            props: {...initialProps, position},
            key: `${position.sheetId}-${position.col}-${position.row}`,
        };
    },
});

cellMenuRegistry.add("sale_field_mapping", {
    name: (env) =>
        env.model.getters.getFieldMapping?.(env.model.getters.getActivePosition())
            ? _t("Edit field mapping")
            : _t("Map to field"),
    icon: "o-spreadsheet-Icon.REFRESH",
    sequence: 200,
    isVisible: (env) => !env.isSmall && isCalculator(env),
    execute: (env) => {
        const position = env.model.getters.getActivePosition();
        if (!env.model.getters.getFieldMapping(position)) {
            env.model.dispatch("MAP_FIELD", {
                sheetId: position.sheetId,
                col: position.col,
                row: position.row,
                // Default to the cell's own row (1-based); the user adjusts.
                position: position.row + 1,
                fieldName: "price_unit",
            });
        }
        env.openSidePanel("SaleFieldMappingPanel");
    },
});

cellMenuRegistry.add("sale_field_mapping_delete", {
    name: _t("Remove field mapping"),
    icon: "o-spreadsheet-Icon.TRASH",
    sequence: 201,
    isVisible: (env) => {
        if (!isCalculator(env)) {
            return false;
        }
        const sheetId = env.model.getters.getActiveSheetId();
        return env.model.getters
            .getSelectedZones()
            .some(
                (zone) =>
                    env.model.getters.getFieldMappingsInZone(sheetId, zone).length
            );
    },
    execute: (env) => {
        const sheetId = env.model.getters.getActiveSheetId();
        for (const zone of env.model.getters.getSelectedZones()) {
            env.model.dispatch("UNMAP_FIELDS", {sheetId, zone});
        }
    },
});

topbarMenuRegistry.add("sale_calculator", {
    name: _t("Calculator"),
    sequence: 1000,
    isVisible: isCalculator,
});
topbarMenuRegistry.addChild("write_to_order", ["sale_calculator"], {
    name: _t("Write to order"),
    sequence: 10,
    icon: "o-spreadsheet-Icon.EXPORT_XLSX",
    isVisible: (env) =>
        Boolean(env.model.getters.getSaleCalculatorContext?.()?.orderId),
    execute: writeToOrder,
});
