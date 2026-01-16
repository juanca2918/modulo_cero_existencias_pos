/** @odoo-module **/

import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

patch(ProductScreen.prototype, {
    setup() {
        super.setup();
        this.orm = useService("orm");
        console.log("[POS Restriction] Setup complete. ORM Service loaded.");
    },

    async addProductToOrder(product) {
        console.log("[POS Restriction] addProductToOrder called:", product.display_name);
        
        // Validación de Configuración (Restrict Zero POS)
        const company = this.pos.company;
        const restrictZeroPos = company && company.restrict_zero_pos;
        
        console.log("[POS Restriction] restrictZeroPos:", restrictZeroPos);
        console.log("[POS Restriction] Product Type:", product.type);
        
        // Validation: Allow if Config is disabled OR Product is 'service'
        if (restrictZeroPos && product.type !== 'service') {
             try {
                 // Call Backend
                 console.log("[POS Restriction] Calling action_get_warehouse_quant...");
                 const stockQuant = await this.orm.call(
                    "product.product",
                    "action_get_warehouse_quant",
                    [product.id, this.pos.config.id]
                 );
                 console.log("[POS Restriction] Backend Stock Quant:", stockQuant);

                 if (stockQuant <= 0) {
                     console.warn("[POS Restriction] DETECTED LOW STOCK! Blocking...");
                     this.notification.add(_t("Acceso Denegado: El producto seleccionado no tiene stock disponible (%s). Por favor actualice el inventario.", stockQuant), {
                        type: "danger",
                        sticky: false,
                    });
                    return; // Blocking the super call
                 } else {
                     console.log("[POS Restriction] Stock OK.");
                 }
                 
             } catch (error) {
                 console.error("[POS Restriction] Error checking stock availability:", error);
                 this.notification.add(_t("Advertencia: No se pudo verificar el stock en tiempo real."), {
                    type: "warning",
                });
             }
        }
        
        return super.addProductToOrder(product);
    }
});
