{
    'name': "Restricción Stock POS (Extensión)",
    'summary': "Bloquea ventas en POS sin stock (Extensión para Modulo Cero Existencias)",
    'description': """
        Módulo de extensión para 'modulo_cero_existencias'.
        Añade la funcionalidad de restricción de stock específicamente para el Punto de Venta.
        Separa la lógica para evitar conflictos con módulos externos.
    """,
    'author': "consultoresodoocolombia",
    'website': "https://consultoresodoocolombia.odoo.com/",

    'category': 'Point of Sale',
    'version': '1.0',
    'depends': ['point_of_sale', 'modulo_cero_existencias'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale.assets_prod': [
            'modulo_cero_existencias_pos/static/src/js/pos_stock_restriction.js',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'OPL-1',
}
