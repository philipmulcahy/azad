/* Copyright(c) 2026 Philip Mulcahy. */

export const order_card_xpath = './/*['
    + 'contains(concat(" ", normalize-space(@class), " "), " js-order-card ") '
    + 'or contains(concat(" ", normalize-space(@class), " "), " order-card ") '
    + 'or contains(concat(" ", normalize-space(@class), " "), " order ") '
    + 'or @id="orderCard"'
    + ']';
