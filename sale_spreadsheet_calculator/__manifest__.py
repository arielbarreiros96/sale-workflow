# Copyright 2026 arielbarreiros96
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl-3.0).
{
    "name": "Sale Spreadsheet Calculator",
    "version": "19.0.2.0.0",
    "summary": "Drive sale order line values from an embedded Odoo spreadsheet",
    "author": "arielbarreiros96, Odoo Community Association (OCA)",
    "website": "https://github.com/OCA/sale-workflow",
    "license": "LGPL-3",
    "category": "Sales",
    "depends": ["sale_management", "spreadsheet_oca"],
    "data": [
        "security/sale_spreadsheet_calculator_groups.xml",
        "views/sale_order_template_views.xml",
        "views/sale_order_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "sale_spreadsheet_calculator/static/src/error_handler/*.esm.js",
        ],
        "spreadsheet.o_spreadsheet": [
            "sale_spreadsheet_calculator/static/src/oca_compat/**/*.js",
            "sale_spreadsheet_calculator/static/src/field_mapping/**/*.js",
            "sale_spreadsheet_calculator/static/src/field_mapping/**/*.xml",
        ],
        "web.assets_unit_tests": [
            "sale_spreadsheet_calculator/static/tests/**/*",
        ],
    },
    "installable": True,
    "application": False,
}
