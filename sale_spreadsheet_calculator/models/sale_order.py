import re
from datetime import datetime, timedelta

from odoo import Command, api, fields, models
from odoo.exceptions import UserError

# o-spreadsheet, like Excel, counts dates as serial days from this epoch.
SPREADSHEET_EPOCH = datetime(1899, 12, 30)


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_bool(value):
    if isinstance(value, str):
        return value.strip().lower() not in ("", "0", "false", "no", "n")
    return bool(value)


def _to_datetime(value):
    number = _to_float(value)
    if number is not None:
        return SPREADSHEET_EPOCH + timedelta(days=number)
    try:
        return fields.Datetime.to_datetime(value)
    except (TypeError, ValueError):
        return None


def _to_ids(value):
    items = value if isinstance(value, (list, tuple)) else re.split(r"\D+", str(value))
    return [int(n) for n in map(_to_float, items) if n is not None and n.is_integer()]


def _cast(field, value):
    """Cast a spreadsheet cell value onto the field's type, or None to skip it.

    An empty cell clears the field to its empty value (``False``, or an empty
    x2many): a mapped cell was placed deliberately, so the field mirrors it.
    """
    ftype = field.type
    if value is None or value == "":
        return [Command.clear()] if ftype in ("one2many", "many2many") else False
    number = _to_float(value)
    whole = number if number is not None and number.is_integer() else None
    if ftype in ("float", "monetary"):
        return number
    if ftype == "integer":
        return None if number is None else int(number)
    if ftype == "boolean":
        return _to_bool(value)
    if ftype in ("char", "text", "html"):
        return str(value)
    if ftype == "selection":
        return str(int(whole)) if whole is not None else str(value)
    if ftype == "datetime":
        return _to_datetime(value)
    if ftype == "date":
        dt = _to_datetime(value)
        return dt.date() if dt else None
    if ftype == "many2one":
        return None if whole is None else int(whole)
    if ftype in ("one2many", "many2many"):
        ids = _to_ids(value)
        return [Command.set(ids)] if ids else None
    return None


class SaleOrder(models.Model):
    _inherit = "sale.order"

    template_calculator_id = fields.Many2one(
        "sale.quote.calculator",
        string="Quote Calculator Template",
        related="sale_order_template_id.quote_calculator_id",
    )
    quote_calculator_ids = fields.One2many(
        "sale.quote.calculator", "order_id", string="Quote Calculators"
    )
    quote_calculator_id = fields.Many2one(
        "sale.quote.calculator",
        compute="_compute_quote_calculator_id",
    )

    @api.depends("quote_calculator_ids")
    def _compute_quote_calculator_id(self):
        for order in self:
            order.quote_calculator_id = order.quote_calculator_ids[:1]

    def action_open_quote_calculator(self):
        self.ensure_one()
        if not self.quote_calculator_id:
            if not self.template_calculator_id:
                raise UserError(
                    self.env._(
                        "This order has no quote calculator. Set one on its "
                        "quotation template first."
                    )
                )
            self.template_calculator_id.copy({"order_id": self.id})
        return self.quote_calculator_id.action_open_calculator()

    def write(self, vals):
        if "sale_order_template_id" in vals:
            for order in self:
                changed = (
                    vals["sale_order_template_id"] != order.sale_order_template_id.id
                )
                if changed and order.quote_calculator_ids:
                    order.quote_calculator_ids.unlink()
        return super().write(vals)

    def apply_field_mappings(self, mappings):
        """Write calculator-computed values into the order lines.

        ``mappings`` is a list of ``{"position", "field", "value"}``. Each row
        targets the line at that 1-based position among the order's product
        lines. ``price_unit`` is written on its own so it registers as a manual
        override that survives quantity-driven recomputation.
        """
        self.ensure_one()
        if self.locked:
            raise UserError(
                self.env._(
                    "This order is locked. Unlock it before writing "
                    "calculator values into its lines."
                )
            )
        lines = self.order_line.filtered(lambda line: not line.display_type)
        Line = self.env["sale.order.line"]
        writes = {}
        for mapping in mappings or []:
            position = int(mapping.get("position") or 0)
            field_name = mapping.get("field")
            if position < 1 or position > len(lines):
                continue
            field = Line._fields.get(field_name)
            if not field or not field.store or field.readonly:
                continue
            value = _cast(field, mapping.get("value"))
            if value is None:
                continue
            writes.setdefault(lines[position - 1].id, {})[field_name] = value

        updated = 0
        for line_id, vals in writes.items():
            line = Line.browse(line_id)
            price = vals.pop("price_unit", None)
            if vals:
                line.write(vals)
            if price is not None:
                line.write({"price_unit": price})
            updated += 1
        return {"updated": updated}
