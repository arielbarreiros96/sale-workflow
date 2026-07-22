Design a pricing calculation in a spreadsheet **inside** Odoo and push the results onto a quotation's lines — no second system, no re-typing.

Quotes often depend on measurements and calculations that today live in an external spreadsheet, forcing someone to maintain two systems and copy values back by hand. This module embeds an odoo spreadsheet editor to the quotation: you build your calculation with real formulas, map result cells to the fields you want to feed (unit price, quantity, discount, description, ...), and write those computed values onto the order lines in one click.

The sync is deliberately one-way (spreadsheet → lines) and triggered manually, so normal quoting is never disturbed and the spreadsheet stays maximally flexible.
