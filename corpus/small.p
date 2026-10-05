block-level on error undo, throw.

define variable dTotalPrice          as decimal no-undo.
define variable dAbsoluteDiscount    as decimal no-undo.
define variable dSumExtendedPrice    as decimal no-undo.
define variable dAvRealativeDiscount as decimal no-undo.
define variable iTotalCustomerQty    as integer no-undo.
define variable dTotalDiscount       as decimal no-undo.
define variable iOrders              as integer no-undo.
define variable dTotalSum            as decimal no-undo.

output to "findOrders.txt".

for each Customer no-lock: 

    dAvRealativeDiscount = 0.
    dTotalDiscount = 0.
    iTotalCustomerQty = 0.
    dTotalSum = 0.
       
    for each Order where Order.Carrier eq "Standard Mail" and Order.CustNum eq Customer.CustNum no-lock:
        
        dTotalPrice = 0.
        dAbsoluteDiscount = 0.
        dSumExtendedPrice = 0.
        iOrders = 0.
        
        for each OrderLine where OrderLine.OrderNum eq Order.OrderNum no-lock:
    
          dTotalPrice = dTotalPrice + (OrderLine.Price * OrderLine.Qty).
          dAbsoluteDiscount = dAbsoluteDiscount + OrderLine.Price * OrderLine.Qty * OrderLine.Discount / 100.
          dSumExtendedPrice = dSumExtendedPrice + OrderLine.ExtendedPrice.
          iOrders = iOrders + 1.
          
        iTotalCustomerQty = iTotalCustomerQty + 1.  
          
        end.
        
        dTotalSum = dTotalSum + dTotalPrice.
        dTotalDiscount = dTotalDiscount + dAbsoluteDiscount.    

        put unformatted "CustNum " Customer.CustNum " " Order.OrderNum " " Customer.Name " discount " dAbsoluteDiscount  " Qty " iOrders skip.
        
    end.

    if iTotalCustomerQty > 0 or dTotalDiscount > 0 then do:
        dAvRealativeDiscount = dTotalDiscount / dTotalSum * 100.
        put unformatted " Total discount " dTotalDiscount " total qty " iTotalCustomerQty skip.
        put unformatted " Average relative discount " round(dAvRealativeDiscount, 2) "%" skip.
        put unformatted "   " skip.
    end.
    
end.

output close.