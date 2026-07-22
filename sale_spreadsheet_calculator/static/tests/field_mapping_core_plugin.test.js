import * as spreadsheet from "@odoo/o-spreadsheet";
import {afterEach, beforeEach, describe, expect, test} from "@odoo/hoot";
import {FieldMappingCorePlugin} from "@sale_spreadsheet_calculator/field_mapping/field_mapping_core_plugin.esm";
import {addRows} from "@spreadsheet/../tests/helpers/commands";
import {createModelWithDataSource} from "@spreadsheet/../tests/helpers/model";
import {defineSpreadsheetModels} from "@spreadsheet/../tests/helpers/data";

const {registries, coreTypes} = spreadsheet;
const {corePluginRegistry, inverseCommandRegistry} = registries;
const {toCartesian, toZone} = spreadsheet.helpers;

const identity = (cmd) => cmd;

defineSpreadsheetModels();
describe.current.tags("headless");

async function makeModel(mappingLines = []) {
    const {model} = await createModelWithDataSource({
        modelConfig: {custom: {mappingLines}},
    });
    return model;
}

function mapField(model, xc, position, fieldName) {
    const {col, row} = toCartesian(xc);
    return model.dispatch("MAP_FIELD", {
        sheetId: model.getters.getActiveSheetId(),
        col,
        row,
        position,
        fieldName,
    });
}

function getMapping(model, xc) {
    const {col, row} = toCartesian(xc);
    return model.getters.getFieldMapping({
        sheetId: model.getters.getActiveSheetId(),
        col,
        row,
    });
}

function unmap(model, xc) {
    return model.dispatch("UNMAP_FIELDS", {
        sheetId: model.getters.getActiveSheetId(),
        zone: toZone(xc),
    });
}

describe("field mapping core plugin", () => {
    beforeEach(() => {
        coreTypes.add("MAP_FIELD").add("UNMAP_FIELDS");
        corePluginRegistry.add("sale_field_mapping_test", FieldMappingCorePlugin);
        inverseCommandRegistry.add("MAP_FIELD", identity);
        inverseCommandRegistry.add("UNMAP_FIELDS", identity);
    });

    afterEach(() => {
        corePluginRegistry.remove("sale_field_mapping_test");
        inverseCommandRegistry.remove("MAP_FIELD");
        inverseCommandRegistry.remove("UNMAP_FIELDS");
    });

    test("stores a mapping on a cell", async () => {
        const model = await makeModel();
        const result = mapField(model, "B2", 2, "price_unit");
        expect(result.isSuccessful).toBe(true);
        expect(getMapping(model, "B2")).toEqual({position: 2, fieldName: "price_unit"});
    });

    test("clamps the position to at least 1", async () => {
        const model = await makeModel();
        mapField(model, "A1", 0, "price_unit");
        expect(getMapping(model, "A1").position).toBe(1);
    });

    test("re-mapping a cell to the same target is a no-op", async () => {
        const model = await makeModel();
        mapField(model, "A1", 1, "price_unit");
        const result = mapField(model, "A1", 1, "price_unit");
        expect(result.isSuccessful).toBe(false);
    });

    test("unmapping clears the mappings in a zone", async () => {
        const model = await makeModel();
        mapField(model, "A1", 1, "price_unit");
        const result = unmap(model, "A1");
        expect(result.isSuccessful).toBe(true);
        expect(getMapping(model, "A1")).toBe(undefined);
    });

    test("unmapping an empty zone is a no-op", async () => {
        const model = await makeModel();
        expect(unmap(model, "A1").isSuccessful).toBe(false);
    });

    test("returns every mapping", async () => {
        const model = await makeModel();
        mapField(model, "A1", 1, "price_unit");
        mapField(model, "B2", 2, "discount");
        expect(model.getters.getAllFieldMappings().size).toBe(2);
    });

    test("mappings survive an export/import round-trip", async () => {
        const model = await makeModel();
        mapField(model, "A1", 3, "product_uom_qty");
        const {model: reloaded} = await createModelWithDataSource({
            spreadsheetData: model.exportData(),
        });
        expect(getMapping(reloaded, "A1")).toEqual({
            position: 3,
            fieldName: "product_uom_qty",
        });
    });

    test("resolves target line labels from the custom config", async () => {
        const model = await makeModel([
            {position: 1, label: "Widget"},
            {position: 2, label: "Frame"},
        ]);
        expect(model.getters.getMappingLineLabel(2)).toBe("Frame");
        expect(model.getters.getMappingLineLabel(99)).toBe("");
    });

    test("a mapping follows its cell when rows are inserted above", async () => {
        const model = await makeModel();
        mapField(model, "A3", 1, "price_unit");
        addRows(model, "before", 0, 1);
        expect(getMapping(model, "A3")).toBe(undefined);
        expect(getMapping(model, "A4")).toEqual({position: 1, fieldName: "price_unit"});
    });

    test("a mapping is dropped when its row is deleted", async () => {
        const model = await makeModel();
        mapField(model, "A3", 1, "price_unit");
        model.dispatch("REMOVE_COLUMNS_ROWS", {
            sheetId: model.getters.getActiveSheetId(),
            dimension: "ROW",
            elements: [2],
        });
        expect(model.getters.getAllFieldMappings().size).toBe(0);
    });
});
