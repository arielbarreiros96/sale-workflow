import {Component, onMounted, useRef, useState} from "@odoo/owl";
import {components, helpers} from "@odoo/o-spreadsheet";
import {ModelFieldSelector} from "@web/core/model_field_selector/model_field_selector";

const {Section} = components;
const {positionToZone} = helpers;

export class FieldMappingSidePanel extends Component {
    static template = "sale_spreadsheet_calculator.FieldMappingSidePanel";
    static components = {ModelFieldSelector, Section};
    static props = {
        onCloseSidePanel: Function,
        position: Object,
    };

    positionInput = useRef("positionInput");

    setup() {
        this.state = useState({saved: false});
        onMounted(() => {
            if (this.positionInput.el) {
                this.positionInput.el.value = String(this.fieldMapping.position);
            }
        });
    }

    get fieldMapping() {
        return this.env.model.getters.getFieldMapping(this.props.position);
    }

    get cellReference() {
        const {sheetId} = this.props.position;
        const range = this.env.model.getters.getRangeFromZone(
            sheetId,
            positionToZone(this.props.position)
        );
        return this.env.model.getters.getRangeString(range, sheetId);
    }

    get targetLineLabel() {
        return this.env.model.getters.getMappingLineLabel(this.fieldMapping.position);
    }

    filterField(field) {
        return field.store && !field.readonly;
    }

    updatePosition() {
        const position = parseInt(this.positionInput.el.value, 10);
        if (position >= 1) {
            this._update({position});
        }
    }

    updateField(fieldName) {
        this._update({fieldName});
    }

    _update(partial) {
        const {sheetId, col, row} = this.props.position;
        const result = this.env.model.dispatch("MAP_FIELD", {
            sheetId,
            col,
            row,
            ...this.fieldMapping,
            ...partial,
        });
        if (result.isSuccessful) {
            this.state.saved = true;
            setTimeout(() => (this.state.saved = false), 1500);
        }
    }
}
