import {ControlPanel} from "@web/search/control_panel/control_panel";
import {SpreadsheetControlPanel} from "@spreadsheet_oca/spreadsheet/bundle/spreadsheet_controlpanel.esm";

/**
 * Restore the base control-panel components on OCA's SpreadsheetControlPanel.
 *
 * spreadsheet_oca sets ``SpreadsheetControlPanel.components = {SpreadsheetName}``,
 * which *overwrites* (instead of extends) the components it inherits from
 * ``ControlPanel`` (Dropdown, DropdownItem, Pager, ...). Its template is a copy
 * of Odoo's control-panel template and still references those components, so it
 * throws "Cannot find the definition of component Dropdown" as soon as a branch
 * using them renders (e.g. the view-switcher/pager shown when the editor is
 * opened from a form view). Re-merging the base components fixes it without
 * touching spreadsheet_oca.
 */
SpreadsheetControlPanel.components = {
    ...ControlPanel.components,
    ...SpreadsheetControlPanel.components,
};
