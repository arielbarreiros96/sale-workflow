# Copyright 2026 arielbarreiros96
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl-3.0).

from odoo import Command
from odoo.exceptions import UserError
from odoo.tests.common import TransactionCase


class TestApplyFieldMappings(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner = cls.env["res.partner"].create({"name": "Test Partner"})
        cls.product = cls.env["product.product"].create(
            {"name": "Test Product", "list_price": 100.0}
        )
        cls.order = cls.env["sale.order"].create(
            {
                "partner_id": cls.partner.id,
                "order_line": [
                    Command.create(
                        {
                            "product_id": cls.product.id,
                            "product_uom_qty": 1,
                            "price_unit": 100.0,
                        }
                    ),
                    Command.create({"display_type": "line_section", "name": "Section"}),
                    Command.create(
                        {
                            "product_id": cls.product.id,
                            "product_uom_qty": 2,
                            "price_unit": 50.0,
                        }
                    ),
                ],
            }
        )
        cls.product_lines = cls.order.order_line.filtered(
            lambda line: not line.display_type
        )

    def test_write_value_to_line(self):
        result = self.order.apply_field_mappings(
            [{"position": 1, "field": "price_unit", "value": 250.0}]
        )
        self.assertEqual(result, {"updated": 1})
        self.assertEqual(self.product_lines[0].price_unit, 250.0)

    def test_position_skips_section_lines(self):
        self.order.apply_field_mappings(
            [{"position": 2, "field": "product_uom_qty", "value": 9}]
        )
        self.assertEqual(self.product_lines[1].product_uom_qty, 9)
        self.assertEqual(self.product_lines[0].product_uom_qty, 1)

    def test_price_unit_survives_quantity_change(self):
        self.order.apply_field_mappings(
            [{"position": 1, "field": "price_unit", "value": 250.0}]
        )
        self.product_lines[0].product_uom_qty = 5
        self.assertEqual(self.product_lines[0].price_unit, 250.0)

    def test_empty_cell_clears_field(self):
        self.order.apply_field_mappings(
            [{"position": 1, "field": "product_uom_qty", "value": ""}]
        )
        self.assertEqual(self.product_lines[0].product_uom_qty, 0.0)

    def test_out_of_range_position_is_skipped(self):
        result = self.order.apply_field_mappings(
            [{"position": 99, "field": "price_unit", "value": 1.0}]
        )
        self.assertEqual(result, {"updated": 0})

    def test_readonly_field_is_skipped(self):
        before = self.product_lines[0].price_subtotal
        result = self.order.apply_field_mappings(
            [{"position": 1, "field": "price_subtotal", "value": 999.0}]
        )
        self.assertEqual(result, {"updated": 0})
        self.assertEqual(self.product_lines[0].price_subtotal, before)

    def test_unknown_field_is_skipped(self):
        result = self.order.apply_field_mappings(
            [{"position": 1, "field": "does_not_exist", "value": 1.0}]
        )
        self.assertEqual(result, {"updated": 0})

    def test_uncastable_value_is_skipped(self):
        result = self.order.apply_field_mappings(
            [{"position": 1, "field": "product_uom_qty", "value": "abc"}]
        )
        self.assertEqual(result, {"updated": 0})
        self.assertEqual(self.product_lines[0].product_uom_qty, 1)

    def test_updated_counts_lines_not_mappings(self):
        result = self.order.apply_field_mappings(
            [
                {"position": 1, "field": "price_unit", "value": 250.0},
                {"position": 1, "field": "product_uom_qty", "value": 3},
            ]
        )
        self.assertEqual(result, {"updated": 1})
        self.assertEqual(self.product_lines[0].price_unit, 250.0)
        self.assertEqual(self.product_lines[0].product_uom_qty, 3)

    def test_locked_order_raises(self):
        self.order.locked = True
        with self.assertRaises(UserError):
            self.order.apply_field_mappings(
                [{"position": 1, "field": "price_unit", "value": 1.0}]
            )


class TestCalculatorSpreadsheet(TransactionCase):
    """The calculator is now a plain ``spreadsheet.spreadsheet``; this module
    only adds the sale-specific glue (context resolution + write-back)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner = cls.env["res.partner"].create({"name": "Test Partner"})
        cls.product = cls.env["product.product"].create({"name": "Test Product"})

    def _make_spreadsheet(self):
        return self.env["spreadsheet.spreadsheet"].create({"name": "Calculator"})

    def _make_template(self):
        return self.env["sale.order.template"].create(
            {
                "name": "Test Template",
                "sale_order_template_line_ids": [
                    Command.create(
                        {"product_id": self.product.id, "product_uom_qty": 1}
                    ),
                    Command.create({"display_type": "line_section", "name": "Section"}),
                    Command.create(
                        {"product_id": self.product.id, "product_uom_qty": 2}
                    ),
                ],
            }
        )

    def _make_order(self, **vals):
        return self.env["sale.order"].create(
            {
                "partner_id": self.partner.id,
                "order_line": [
                    Command.create({"product_id": self.product.id}),
                    Command.create({"display_type": "line_section", "name": "S"}),
                    Command.create({"product_id": self.product.id}),
                ],
                **vals,
            }
        )

    def test_context_from_order(self):
        order = self._make_order()
        spreadsheet = self._make_spreadsheet()
        order.calculator_spreadsheet_id = spreadsheet
        context = spreadsheet.get_sale_calculator_context()
        self.assertTrue(context["isCalculator"])
        self.assertEqual(context["orderId"], order.id)
        self.assertEqual([line["position"] for line in context["lines"]], [1, 2])

    def test_context_from_template(self):
        template = self._make_template()
        spreadsheet = self._make_spreadsheet()
        template.quote_calculator_id = spreadsheet
        context = spreadsheet.get_sale_calculator_context()
        self.assertTrue(context["isCalculator"])
        self.assertFalse(context["orderId"])
        self.assertEqual([line["position"] for line in context["lines"]], [1, 2])

    def test_context_of_unrelated_spreadsheet(self):
        spreadsheet = self._make_spreadsheet()
        context = spreadsheet.get_sale_calculator_context()
        self.assertFalse(context["isCalculator"])
        self.assertFalse(context["orderId"])
        self.assertEqual(context["lines"], [])

    def test_write_field_mappings_to_order(self):
        order = self._make_order()
        product_lines = order.order_line.filtered(lambda line: not line.display_type)
        spreadsheet = self._make_spreadsheet()
        order.calculator_spreadsheet_id = spreadsheet
        result = spreadsheet.write_field_mappings_to_order(
            [{"position": 1, "field": "price_unit", "value": 250.0}]
        )
        self.assertEqual(result, {"updated": 1})
        self.assertEqual(product_lines[0].price_unit, 250.0)

    def test_write_field_mappings_without_order_raises(self):
        template = self._make_template()
        spreadsheet = self._make_spreadsheet()
        template.quote_calculator_id = spreadsheet
        with self.assertRaises(UserError):
            spreadsheet.write_field_mappings_to_order(
                [{"position": 1, "field": "price_unit", "value": 1.0}]
            )

    def test_open_quote_calculator_without_template_raises(self):
        order = self.env["sale.order"].create({"partner_id": self.partner.id})
        with self.assertRaises(UserError):
            order.action_open_quote_calculator()

    def test_open_quote_calculator_copies_template_calculator(self):
        template = self._make_template()
        template.quote_calculator_id = self._make_spreadsheet()
        order = self.env["sale.order"].create(
            {"partner_id": self.partner.id, "sale_order_template_id": template.id}
        )
        action = order.action_open_quote_calculator()
        self.assertTrue(order.calculator_spreadsheet_id)
        self.assertNotEqual(
            order.calculator_spreadsheet_id, template.quote_calculator_id
        )
        # Reuses spreadsheet_oca's own editor action.
        self.assertEqual(action["type"], "ir.actions.client")
        self.assertEqual(action["tag"], "action_spreadsheet_oca")
        self.assertEqual(
            action["params"]["spreadsheet_id"], order.calculator_spreadsheet_id.id
        )

    def test_open_quote_calculator_reuses_existing_copy(self):
        template = self._make_template()
        template.quote_calculator_id = self._make_spreadsheet()
        order = self.env["sale.order"].create(
            {"partner_id": self.partner.id, "sale_order_template_id": template.id}
        )
        order.action_open_quote_calculator()
        existing = order.calculator_spreadsheet_id
        order.action_open_quote_calculator()
        self.assertEqual(order.calculator_spreadsheet_id, existing)

    def test_changing_template_unlinks_calculator(self):
        template = self._make_template()
        template.quote_calculator_id = self._make_spreadsheet()
        order = self.env["sale.order"].create(
            {"partner_id": self.partner.id, "sale_order_template_id": template.id}
        )
        order.action_open_quote_calculator()
        self.assertTrue(order.calculator_spreadsheet_id)
        order.sale_order_template_id = self._make_template()
        self.assertFalse(order.calculator_spreadsheet_id)
