from odoo import fields, models


class SaleQuoteCalculator(models.Model):
    _name = "sale.quote.calculator"
    _inherit = ["spreadsheet.mixin"]
    _description = "Sale Quote Calculator"

    name = fields.Char(
        required=True,
        default=lambda self: self.env._("Quote Calculator"),
    )
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company)
    order_id = fields.Many2one("sale.order", index="btree_not_null", ondelete="cascade")

    def action_open_calculator(self):
        self.ensure_one()
        return {
            "type": "ir.actions.client",
            "tag": "sale_spreadsheet_calculator.calculator_editor",
            "name": self.name,
            "params": {"calculator_id": self.id},
        }

    def get_mapping_lines(self):
        """Return the lines a field mapping can target, as ``[{position, label}]``.

        When the calculator belongs to an order, these are the order's lines;
        otherwise (a template calculator) they are the lines of the quotation
        template it is attached to. Positions are 1-based and skip section/note
        lines, so they stay aligned between the template and the resulting order.
        """
        self.ensure_one()
        if self.order_id:
            lines = self.order_id.order_line
        else:
            template = self.env["sale.order.template"].search(
                [("quote_calculator_id", "=", self.id)], limit=1
            )
            lines = template.sale_order_template_line_ids
        lines = lines.filtered(lambda line: not line.display_type)
        return [
            {
                "position": index,
                "label": line.product_id.display_name or line.name or "",
            }
            for index, line in enumerate(lines, start=1)
        ]
