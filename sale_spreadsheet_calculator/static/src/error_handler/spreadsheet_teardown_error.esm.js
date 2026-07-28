import {UncaughtPromiseError} from "@web/core/errors/error_service";
import {registry} from "@web/core/registry";

/**
 * Swallow the benign "Component is destroyed" rejection raised by the OCA
 * spreadsheet's collaborative transport.
 *
 * The editor's collaborative session broadcasts debounced messages (e.g. a
 * cursor move) through a component-bound ORM. When a message resolves after the
 * editor has been torn down, that ORM rejects with "Component is destroyed"
 * (see @web/core/utils/hooks). The operation was auto-cancelled precisely
 * because the component is gone, so the rejection is safe to drop — but left
 * unhandled it surfaces as an uncaught-promise error dialog.
 *
 * We scope this tightly: only that exact message, and only when the stack comes
 * from the spreadsheet bundle, so unrelated errors keep their normal handling.
 * This lives here (not in spreadsheet_oca) so the fix ships entirely within
 * sale_spreadsheet_calculator.
 */
function spreadsheetTeardownErrorHandler(env, error, originalError) {
    if (
        !(error instanceof UncaughtPromiseError) ||
        !(originalError instanceof Error) ||
        originalError.message !== "Component is destroyed" ||
        typeof error.traceback !== "string" ||
        !error.traceback.includes("spreadsheet")
    ) {
        return false;
    }
    error.unhandledRejectionEvent.preventDefault();
    return true;
}

registry
    .category("error_handlers")
    .add("saleSpreadsheetTeardownError", spreadsheetTeardownErrorHandler, {sequence: 1});
