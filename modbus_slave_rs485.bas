' Modbus RTU slave over RS485 for BASCOM-AVR
' Target example: ATmega328P, 16 MHz, 9600 baud, 8N1
' RS485 driver example: MAX485 with DE and /RE tied together on PD2

$regfile = "m328pdef.dat"
$crystal = 16000000
$baud = 9600

Config Portd.2 = Output
Rs485_dir Alias Portd.2

Const Slave_id = 1
Const Rx_size = 32
Const Tx_size = 32
Const Holding_count = 10

Dim Rxbuf(rx_size) As Byte
Dim Txbuf(tx_size) As Byte
Dim Holding(holding_count) As Word

Dim Rx_len As Byte
Dim Tx_len As Byte
Dim Func As Byte
Dim Start_addr As Word
Dim Quantity As Word
Dim Write_value As Word
Dim Calc_crc As Word
Dim Frame_crc As Word
Dim I As Byte

Declare Function Read_frame() As Byte
Declare Function Crc_rx(byval L As Byte) As Word
Declare Function Crc_tx(byval L As Byte) As Word
Declare Sub Send_tx()
Declare Sub Send_exception(byval Code As Byte)
Declare Sub Handle_read_holding()
Declare Sub Handle_write_single()

' Start in receive mode.
Rs485_dir = 0

' Example holding registers. Modbus address 0 maps to Holding(1).
Holding(1) = 123
Holding(2) = 456
Holding(3) = 789
Holding(4) = 1000

Do
   Rx_len = Read_frame()

   If Rx_len >= 8 Then
      If Rxbuf(1) = Slave_id Then
         Frame_crc = Makeint(rxbuf(rx_len - 1) , Rxbuf(rx_len))
         Calc_crc = Crc_rx(rx_len - 2)

         If Frame_crc = Calc_crc Then
            Func = Rxbuf(2)

            Select Case Func
               Case 3
                  Handle_read_holding
               Case 6
                  Handle_write_single
               Case Else
                  Send_exception 1
            End Select
         End If
      End If
   End If
Loop

End

' Reads one RTU frame. The end of frame is detected by a silent timeout.
Function Read_frame() As Byte
   Local Count As Byte
   Local Silence As Word
   Local Wait_first As Word
   Local B As Byte

   Count = 0
   Silence = 0
   Wait_first = 0

   Do
      If Ischarwaiting() = 1 Then Exit Do
      Waitus 100
      Incr Wait_first
      If Wait_first > 5000 Then
         Read_frame = 0
         Exit Function
      End If
   Loop

   Do
      If Ischarwaiting() = 1 Then
         B = Inkey()
         If Count < Rx_size Then
            Incr Count
            Rxbuf(count) = B
         End If
         Silence = 0
      Else
         Waitus 100
         Incr Silence
      End If

      ' About 4 ms silence at 9600 baud; more than Modbus RTU 3.5 chars.
      If Silence > 40 Then Exit Do
   Loop

   Read_frame = Count
End Function

Sub Handle_read_holding()
   Local P As Byte

   Start_addr = Makeint(rxbuf(5) , Rxbuf(4))
   Quantity = Makeint(rxbuf(7) , Rxbuf(6))

   If Quantity = 0 Or Quantity > Holding_count Then
      Send_exception 3
      Exit Sub
   End If

   If Start_addr + Quantity > Holding_count Then
      Send_exception 2
      Exit Sub
   End If

   Txbuf(1) = Slave_id
   Txbuf(2) = 3
   Txbuf(3) = Quantity * 2
   P = 4

   For I = 1 To Quantity
      Write_value = Holding(start_addr + I)
      Txbuf(p) = High(write_value)
      Incr P
      Txbuf(p) = Low(write_value)
      Incr P
   Next I

   Tx_len = P - 1
   Calc_crc = Crc_tx(tx_len)
   Incr Tx_len
   Txbuf(tx_len) = Low(calc_crc)
   Incr Tx_len
   Txbuf(tx_len) = High(calc_crc)

   Send_tx
End Sub

Sub Handle_write_single()
   Start_addr = Makeint(rxbuf(5) , Rxbuf(4))
   Write_value = Makeint(rxbuf(7) , Rxbuf(6))

   If Start_addr >= Holding_count Then
      Send_exception 2
      Exit Sub
   End If

   Holding(start_addr + 1) = Write_value

   ' Function 06 response is an echo of the request.
   For I = 1 To 8
      Txbuf(i) = Rxbuf(i)
   Next I
   Tx_len = 8

   Send_tx
End Sub

Sub Send_exception(byval Code As Byte)
   Txbuf(1) = Slave_id
   Txbuf(2) = Func Or &H80
   Txbuf(3) = Code

   Calc_crc = Crc_tx(3)
   Txbuf(4) = Low(calc_crc)
   Txbuf(5) = High(calc_crc)
   Tx_len = 5

   Send_tx
End Sub

Sub Send_tx()
   Waitms 2
   Rs485_dir = 1
   Waitus 100

   For I = 1 To Tx_len
      Printbin Txbuf(i);
   Next I

   Waitms 5
   Rs485_dir = 0
End Sub

Function Crc_rx(byval L As Byte) As Word
   Local C As Word
   Local J As Byte
   Local K As Byte

   C = &HFFFF

   For J = 1 To L
      C = C Xor Rxbuf(j)
      For K = 1 To 8
         If C.0 = 1 Then
            Shift C , Right , 1
            C = C Xor &HA001
         Else
            Shift C , Right , 1
         End If
      Next K
   Next J

   Crc_rx = C
End Function

Function Crc_tx(byval L As Byte) As Word
   Local C As Word
   Local J As Byte
   Local K As Byte

   C = &HFFFF

   For J = 1 To L
      C = C Xor Txbuf(j)
      For K = 1 To 8
         If C.0 = 1 Then
            Shift C , Right , 1
            C = C Xor &HA001
         Else
            Shift C , Right , 1
         End If
      Next K
   Next J

   Crc_tx = C
End Function
