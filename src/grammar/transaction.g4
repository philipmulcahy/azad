grammar transaction;

// --- PARSER RULES ---

status_transaction_group:
    status NL
    dated_transactions_group
    ;

dated_transactions_group:
    dated_transactions
    (NL dated_transactions)*
    ;

dated_transactions :
    date
    (NL dateless_transaction)*
    ;

dateless_transaction :
    payment_source_and_amount NL
    (PENDING NL)?
    (ORDER_HEADER ORDER_ID NL)+
    vendor
    ;

date : MONTH HWS DAY_OF_MONTH COMMA HWS year ;

payment_source_and_amount :
    card_issuer HWS FOUR_ASTERISKS card_digits NL CURRENCY_AMOUNT
    ;

card_issuer : VISA
            | AMEX
            ;

vendor : AMAZON_COM
       | AMAZON_MKTP
       ;

useless_preamble :
    line NL
    line
    transactions_start
    line
    ;

transactions_start:
    NL TRANSACTIONS NL ;

line: (text_item | HWS)* ;

text_item : WORD
          | MONTH
          | keyword
          | SYMBOL
          | SPECIAL_CHAR
          | COMMA
          ;

status : IN_PROGRESS | COMPLETED ;

keyword : ORDER_HEADER
        | PENDING
        | VISA
        | AMEX
        | AMAZON_COM
        | AMAZON_MKTP
        | TRANSACTIONS
        | IN_PROGRESS
        | COMPLETED
        ;

year : FOUR_DIGITS_STARTING_WITH_2;

card_digits : FOUR_DIGITS_STARTING_WITH_2
            | FOUR_DIGITS_NOT_STARTING_WITH_2
            ;

// --- LEXER RULES ---

// 1. Literal Keywords
ORDER_HEADER : 'Order #' ;
PENDING      : 'Pending' ;
VISA         : 'Visa' ;
AMEX         : 'American Express' ;
AMAZON_COM   : 'Amazon.com' ;
AMAZON_MKTP  : 'AMZN Mktp US' ;
TRANSACTIONS : 'Transactions' ;
IN_PROGRESS  : 'In Progress' ;
COMPLETED    : 'Completed' ;

CURRENCY_AMOUNT:
    DASH? CURRENCY DECIMAL
    ;

// 2. The Month Rule - NO PARENTHESES AT ALL
MONTH : 'January'
      | 'February'
      | 'March'
      | 'April'
      | 'May'
      | 'June'
      | 'July'
      | 'August'
      | 'September'
      | 'October'
      | 'November'
      | 'December'
      ;

// 3. Flattened Patterns
ORDER_ID                        : [0-9][0-9][0-9] '-'
                                  [0-9][0-9][0-9][0-9][0-9][0-9][0-9] '-'
                                  [0-9][0-9][0-9][0-9][0-9][0-9][0-9] ;
DECIMAL                         : [0-9]+ '.' [0-9][0-9] ;
FOUR_DIGITS_STARTING_WITH_2     : '2'[0-9][0-9][0-9] ;
FOUR_DIGITS_NOT_STARTING_WITH_2 : [013-9][0-9][0-9][0-9] ;
DAY_OF_MONTH                    : [0-2] [0-9]
                                | '3' [01] ;

// 4. Symbols (Tokens, not fragments)
COMMA          : ',' ;
DASH           : '-' ;
CURRENCY       : '$' ;
FOUR_ASTERISKS : '****' ;
SYMBOL         : [#!./()&,] ;

// 5. Whitespace
HWS : [ \t]+ ;
NL  : [\r\n]+ ;

WORD         : [a-zA-Z]+ ;
SPECIAL_CHAR : ~[a-zA-Z0-9 \t\r\n] ;
