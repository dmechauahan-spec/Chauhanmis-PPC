import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useCreateSalesOrder } from "./use-sales-orders";
import { salesOrderFormSchema, type SalesOrderFormInput, type SalesOrderFormValues } from "./sales-order-schema";
import { SkuCombobox } from "@/features/orders/sku-combobox";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiErrorMessage } from "@/lib/api-client";

export function CreateSalesOrderPage() {
  const navigate = useNavigate();
  const createSalesOrder = useCreateSalesOrder();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SalesOrderFormInput, unknown, SalesOrderFormValues>({
    resolver: zodResolver(salesOrderFormSchema),
  });

  async function onSubmit(values: SalesOrderFormValues) {
    try {
      const salesOrder = await createSalesOrder.mutateAsync({
        salesOrderNo: values.salesOrderNo,
        customer: values.customer,
        sku: values.sku,
        orderedQty: values.orderedQty,
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
      });
      navigate(`/sales-orders/${salesOrder.salesOrderNo}`);
    } catch {
      // Surfaced below via createSalesOrder.isError/error.
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-6">
      <Link to="/sales-orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to Sales Orders
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Sales Order</CardTitle>
          <CardDescription>Creates a Sales Order in Open status — nothing reserved against it yet.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="flex flex-col gap-4">
            {createSalesOrder.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(createSalesOrder.error)}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="salesOrderNo">Sales Order No.</Label>
              <Input id="salesOrderNo" placeholder="SO-1024" className="font-mono" aria-invalid={!!errors.salesOrderNo} {...register("salesOrderNo")} />
              {errors.salesOrderNo && <p className="text-xs text-status-critical">{errors.salesOrderNo.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer">Customer</Label>
              <Input id="customer" aria-invalid={!!errors.customer} {...register("customer")} />
              {errors.customer && <p className="text-xs text-status-critical">{errors.customer.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Controller
                control={control}
                name="sku"
                render={({ field }) => (
                  <SkuCombobox value={field.value || null} hasError={!!errors.sku} onSelect={(product) => field.onChange(product.sku)} />
                )}
              />
              {errors.sku && <p className="text-xs text-status-critical">{errors.sku.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="orderedQty">Ordered Qty</Label>
                <Input id="orderedQty" type="number" min={0} step="0.01" aria-invalid={!!errors.orderedQty} {...register("orderedQty")} />
                {errors.orderedQty && <p className="text-xs text-status-critical">{errors.orderedQty.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dueDate">Due Date (optional)</Label>
                <Input id="dueDate" type="date" onChange={(e) => setValue("dueDate", e.target.value, { shouldValidate: true })} />
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/sales-orders")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create Sales Order"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
