from odoo import models
from odoo.exceptions import UserError


class SpreadsheetSpreadsheet(models.Model):
    _inherit = "spreadsheet.spreadsheet"

    def _get_calculator_order(self):
        """Return the sale order this spreadsheet is the calculator of, if any."""
        self.ensure_one()
        return self.env["sale.order"].search(
            [("calculator_spreadsheet_id", "=", self.id)], limit=1
        )

    def _get_calculator_template(self):
        """Return the quotation template this spreadsheet is attached to, if any."""
        self.ensure_one()
        return self.env["sale.order.template"].search(
            [("quote_calculator_id", "=", self.id)], limit=1
        )

    def get_sale_calculator_context(self):
        """Sale context the in-editor field-mapping UI needs.

        Returns ``{isCalculator, orderId, lines}`` where ``lines`` are the
        mappable lines as ``[{position, label}]``. When the spreadsheet belongs
        to an order these are the order's lines; otherwise (a template
        calculator) they are the quotation template's lines. Positions are
        1-based and skip section/note lines, so they stay aligned between the
        template and the resulting order.
        """
        self.ensure_one()
        order = self._get_calculator_order()
        if order:
            lines = order.order_line
        else:
            lines = self._get_calculator_template().sale_order_template_line_ids
        lines = lines.filtered(lambda line: not line.display_type)
        return {
            "isCalculator": bool(order or self._get_calculator_template()),
            "orderId": order.id or False,
            "lines": [
                {
                    "position": index,
                    "label": line.product_id.display_name or line.name or "",
                }
                for index, line in enumerate(lines, start=1)
            ],
        }

    def write_field_mappings_to_order(self, mappings):
        """Write calculator-computed values into the linked order's lines."""
        self.ensure_one()
        order = self._get_calculator_order()
        if not order:
            raise UserError(
                self.env._("This calculator is not attached to a sale order.")
            )
        return order.apply_field_mappings(mappings)
