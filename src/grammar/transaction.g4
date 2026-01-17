grammar transaction;

// --- PARSER RULES ---

// Entry point. One status followed by one or more date groups.
status_transaction_group
    : status dated_transactions_group
    ;

dated_transactions_group
    : dated_transactions+
    ;

// A date followed by zero or more dateless transactions.
dated_transactions
    : date dateless_transaction*
    ;

// Each field is now independent of whitespace/newlines.
dateless_transaction
    : payment_source_and_amount
      PENDING?
      (ORDER_ID_HEADER ORDER_ID)+
      vendor
    ;

date : MONTH DAY_OF_MONTH COMMA year ;

payment_source_and_amount
    : card_issuer FOUR_ASTERISKS card_digits CURRENCY_AMOUNT
    ;

card_issuer : VISA | AMEX ;

vendor : AMAZON_COM | AMAZON_MKTP ;

status : IN_PROGRESS | COMPLETED ;

year : FOUR_DIGITS_STARTING_WITH_2;

card_digits : FOUR_DIGITS_STARTING_WITH_2 | FOUR_DIGITS_NOT_STARTING_WITH_2 ;

// --- LEXER RULES ---

ORDER_ID_HEADER : 'Order #' ;
PENDING         : 'Pending' ;
VISA            : 'Visa' ;
AMEX            : 'American Express' ;
AMAZON_COM      : 'Amazon.com' ;
AMAZON_MKTP     : 'AMZN Mktp US' ;
TRANSACTIONS    : 'Transactions' ;
IN_PROGRESS     : 'In Progress' ;
COMPLETED       : 'Completed' ;

CURRENCY_AMOUNT : (DASH|PLUS)? CURRENCY DECIMAL ;

MONTH : 'January' | 'February' | 'March' | 'April' | 'May' | 'June'
      | 'July' | 'August' | 'September' | 'October' | 'November' | 'December' ;

ORDER_ID    : [0-9][0-9][0-9] '-' [0-9][0-9][0-9][0-9][0-9][0-9][0-9] '-' [0-9][0-9][0-9][0-9][0-9][0-9][0-9] ;
DECIMAL     : [0-9]+ '.' [0-9][0-9] ;
FOUR_DIGITS_STARTING_WITH_2     : '2'[0-9][0-9][0-9] ;
FOUR_DIGITS_NOT_STARTING_WITH_2 : [013-9][0-9][0-9][0-9] ;
DAY_OF_MONTH : [0-2] [0-9] | '3' [01] | [1-9] ;

COMMA          : ',' ;
DASH           : '-' ;
PLUS           : '+' ;
CURRENCY       : '$' ;
FOUR_ASTERISKS : '****' ;
SYMBOL         : [#!./()&] ;

// All whitespace and newlines are sent to the hidden channel.
// The parser never sees them, but they still exist in the token stream.
WS : [ \t\r\n]+ -> channel(HIDDEN) ;

WORD         : [a-zA-Z]+ ;
SPECIAL_CHAR : ~[a-zA-Z0-9 \t\r\n] ;