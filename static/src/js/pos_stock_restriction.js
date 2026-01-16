/** @odoo-module **/

import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

// -------------------------------------------------------------------
// 1. MODEL PATCH: PosOrderline
//    - Handles Quantity Changes (Numpad)
//    - Handles Price Changes
// -------------------------------------------------------------------
patch(PosOrderline.prototype, {
    set_quantity(quantity, keep_price) {
        // Restriction: Max Available Stock (only if we know the max_stock)
        // We allow deleting (quantity 0) or returns (quantity < 0)
        const company = this.company;
        const restrictZeroPos = company && company.restrict_zero_pos;
        
        if (restrictZeroPos && this.max_available_stock !== undefined && quantity > 0) {
             if (quantity > this.max_available_stock) {
                 // Notify User
                 // We need a way to show notification from Model independently? 
                 // Models usually don't have UI access directly, but 'env.services' might be available?
                 // In Odoo 18, we can try accessing services via registry? Or just fallback to console/return false.
                 // Ideally we prevent the change.
                 
                 // NOTE: Since we are in a model, showing popup is hard. 
                 // We will simply cap the quantity and warn via console/UI refresh if possible.
                 // Or better: Let's rely on the Screen logic to blocking inputs, 
                 // BUT 'set_quantity' is called by Numpad. 
                 
                 // FORCE CAP the quantity
                 // But we must allow the user to correct it. 
                 // If we return 'false', the numpad might not update.
                 // We will set it to max_available_stock.
                 
                 // Use a temporary flag to avoid infinite recursion if we call set_quantity again
                 if (!this._checking_stock) {
                     this._checking_stock = true;
                     // console.warn(`Blocking Qty ${quantity} > ${this.max_available_stock}`);
                     // We can't easily show a notification from here without 'env'.
                     // For now, we strictly block by setting it to max.
                     quantity = this.max_available_stock;
                     
                     // We can try to assume 'this.env' exists or similar? 
                     // In POS, notifications are usually on the Screen.
                 }
                 this._checking_stock = false;
             }
        }
        
        // Restriction: Price Check (Indirectly via quantity set? No, this is quantity)
        return super.set_quantity(quantity, keep_price);
    },

    set_unit_price(price) {
        const company = this.company;
        const restrictZeroPos = company && company.restrict_zero_pos;

        // Restriction: Zero/Negative Price
        // Allow if it's a return (quantity < 0) - Check qty first
        if (restrictZeroPos && price <= 0 && this.get_quantity() > 0) {
             // console.warn("Blocking Zero Price");
             // We cannot easily block execution here returning false.
             // We will enforce a minimum price of 1 if strict? 
             // Or just allow it here and block at Payment Screen where we have UI control.
             // Blocking at Payment Screen is safer and easier to notify.
        }

        return super.set_unit_price(price);
    }
});

// -------------------------------------------------------------------
// 2. SCREEN PATCH: ProductScreen
//    - Handles Initial Add (Fetching Stock)
// -------------------------------------------------------------------
patch(ProductScreen.prototype, {
    setup() {
        super.setup();
        this.orm = useService("orm");
        this.notification = useService("notification"); // Ensure we have this
    },

    async addProductToOrder(product) {
        const company = this.pos.company;
        const restrictZeroPos = company && company.restrict_zero_pos;

        // 1. Initial Check (Before Add) - Optimization
        if (restrictZeroPos && product.type !== 'service') {
             try {
                 const stockQuant = await this.orm.call(
                    "product.product",
                    "action_get_warehouse_quant",
                    [product.id, this.pos.config.id]
                 );
                 
                 if (stockQuant <= 0) {
                     this.notification.add(_t("Acceso Denegado: Stock insuficiente (%s).", stockQuant), { type: "danger" });
                     return; // Block adding
                 }
                 
                 // 2. Proceed to Add
                 const result = await super.addProductToOrder(product);
                 
                 // 3. Store Constraint on New/Selected Line
                 const line = this.currentOrder.get_selected_orderline();
                 if (line && line.product_id.id === product.id) {
                     line.max_available_stock = stockQuant;
                     
                     // Re-Validate (in case super added > stock, though unlikely for 1 unit)
                     if (line.get_quantity() > stockQuant) {
                         line.set_quantity(stockQuant); // Cap it
                         this.notification.add(_t("Stock Limitado: Se ajustó la cantidad al máximo disponible (%s).", stockQuant), { type: "warning" });
                     }
                 }
                 return result;

             } catch (error) {
                 console.error("Stock Check Error:", error);
                 // Fallback: Allow add but warn? Or Block? Safety first -> Allow but warn.
                 this.notification.add(_t("Error verificando stock. Se permite venta bajo riesgo."), { type: "warning" });
                 return super.addProductToOrder(product);
             }
        }
        
        return super.addProductToOrder(product);
    }
});

// -------------------------------------------------------------------
// 3. SCREEN PATCH: PaymentScreen
//    - Final Validation (Strict Block)
// -------------------------------------------------------------------
patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        const company = this.pos.company;
        const restrictZeroPos = company && company.restrict_zero_pos;
        
        if (restrictZeroPos) {
            const order = this.currentOrder;
            const lines = order.get_orderlines();
            
            for (const line of lines) {
                if (line.product_id.type === 'service') continue;

                // 1. Price Check
                if (line.get_unit_price() <= 0 && line.get_quantity() > 0) {
                     this.notification.add(_t("Error: El producto '%s' tiene precio 0 o negativo.", line.get_full_product_name()), { type: "danger" });
                     return; // Block Payment
                }

                // 2. Stock Check (If max_available_stock is known)
                // If it's NOT known (e.g. reload), we might want to re-fetch?
                // For now, strict check only if known to avoid blocking valid sales on refresh.
                // ideally we re-verify all? That would be slow.
                if (line.max_available_stock !== undefined) {
                    if (line.get_quantity() > line.max_available_stock) {
                         this.notification.add(_t("Stock Insuficiente: '%s' (Solicitado: %s, Max: %s).", line.get_full_product_name(), line.get_quantity(), line.max_available_stock), { type: "danger" });
                         return; // Block Payment
                    }
                }
            }
        }

        return super.validateOrder(isForceValidate);
    }
});
