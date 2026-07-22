import {coreTypes, registries} from "@odoo/o-spreadsheet";
import {FieldMappingCorePlugin} from "./field_mapping_core_plugin.esm";
import {FieldMappingSidePanel} from "./field_mapping_side_panel.esm";
import {_t} from "@web/core/l10n/translation";
import {onWillUnmount} from "@odoo/owl";

const {
    corePluginRegistry,
    sidePanelRegistry,
    cellMenuRegistry,
    inverseCommandRegistry,
} = registries;

coreTypes.add("MAP_FIELD").add("UNMAP_FIELDS");

const identity = (cmd) => cmd;

/**
 * Register the field-mapping plugin, side panel and menus for the lifetime of
 * the calling component (removed on unmount), so they only exist inside our
 * editor and never leak into other spreadsheets.
 */
export function registerSaleFieldMapping() {
    const add = (registry, key, value) => {
        registry.add(key, value);
        onWillUnmount(() => registry.remove(key));
    };

    add(corePluginRegistry, "sale_field_mapping", FieldMappingCorePlugin);
    add(inverseCommandRegistry, "MAP_FIELD", identity);
    add(inverseCommandRegistry, "UNMAP_FIELDS", identity);

    add(sidePanelRegistry, "SaleFieldMappingPanel", {
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

    add(cellMenuRegistry, "sale_field_mapping", {
        name: (env) =>
            env.model.getters.getFieldMapping?.(env.model.getters.getActivePosition())
                ? _t("Edit field mapping")
                : _t("Map to field"),
        icon: "o-spreadsheet-Icon.REFRESH",
        sequence: 200,
        isVisible: (env) => !env.isSmall,
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

    add(cellMenuRegistry, "sale_field_mapping_delete", {
        name: _t("Remove field mapping"),
        icon: "o-spreadsheet-Icon.TRASH",
        sequence: 201,
        isVisible: (env) => {
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
}
