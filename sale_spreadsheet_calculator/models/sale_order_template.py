from odoo import fields, models


class SaleOrderTemplate(models.Model):
    _inherit = "sale.order.template"

    quote_calculator_id = fields.Many2one(
        "sale.quote.calculator",
        string="Quote Calculator",
        domain="[('order_id', '=', False)]",
    )
