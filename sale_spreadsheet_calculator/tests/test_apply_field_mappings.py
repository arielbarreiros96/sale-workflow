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
        cls.calculator = cls.env["sale.quote.calculator"].create(
            {"order_id": cls.order.id}
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


class TestCalculatorModel(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner = cls.env["res.partner"].create({"name": "Test Partner"})
        cls.product = cls.env["product.product"].create({"name": "Test Product"})

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

    def test_action_open_calculator(self):
        calculator = self.env["sale.quote.calculator"].create({})
        action = calculator.action_open_calculator()
        self.assertEqual(action["type"], "ir.actions.client")
        self.assertEqual(action["tag"], "sale_spreadsheet_calculator.calculator_editor")
        self.assertEqual(action["params"], {"calculator_id": calculator.id})

    def test_get_mapping_lines_from_order(self):
        order = self.env["sale.order"].create(
            {
                "partner_id": self.partner.id,
                "order_line": [
                    Command.create({"product_id": self.product.id}),
                    Command.create({"display_type": "line_section", "name": "S"}),
                    Command.create({"product_id": self.product.id}),
                ],
            }
        )
        calculator = self.env["sale.quote.calculator"].create({"order_id": order.id})
        lines = calculator.get_mapping_lines()
        self.assertEqual([line["position"] for line in lines], [1, 2])

    def test_get_mapping_lines_from_template(self):
        template = self._make_template()
        calculator = self.env["sale.quote.calculator"].create({})
        template.quote_calculator_id = calculator
        lines = calculator.get_mapping_lines()
        self.assertEqual([line["position"] for line in lines], [1, 2])

    def test_open_quote_calculator_without_template_raises(self):
        order = self.env["sale.order"].create({"partner_id": self.partner.id})
        with self.assertRaises(UserError):
            order.action_open_quote_calculator()

    def test_open_quote_calculator_copies_template_calculator(self):
        template = self._make_template()
        template.quote_calculator_id = self.env["sale.quote.calculator"].create({})
        order = self.env["sale.order"].create(
            {"partner_id": self.partner.id, "sale_order_template_id": template.id}
        )
        order.action_open_quote_calculator()
        self.assertTrue(order.quote_calculator_id)
        self.assertEqual(order.quote_calculator_id.order_id, order)
        self.assertNotEqual(order.quote_calculator_id, template.quote_calculator_id)

    def test_changing_template_unlinks_calculator(self):
        template = self._make_template()
        template.quote_calculator_id = self.env["sale.quote.calculator"].create({})
        order = self.env["sale.order"].create(
            {"partner_id": self.partner.id, "sale_order_template_id": template.id}
        )
        order.action_open_quote_calculator()
        self.assertTrue(order.quote_calculator_ids)
        order.sale_order_template_id = self._make_template()
        self.assertFalse(order.quote_calculator_ids)
