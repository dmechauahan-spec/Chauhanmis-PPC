import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useCreateOrder } from "./use-orders";
import { createOrderFormSchema, type CreateOrderFormInput, type CreateOrderFormValues } from "./create-order-schema";
import { SkuCombobox } from "./sku-combobox";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiErrorMessage } from "@/lib/api-client";
import type { Product } from "@/types/api";

export function CreateOrderPage() {
  const navigate = useNavigate();
  const createOrder = useCreateOrder();
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrderFormInput, unknown, CreateOrderFormValues>({
    resolver: zodResolver(createOrderFormSchema),
    defaultValues: { priority: "Medium" },
  });

  async function onSubmit(values: CreateOrderFormValues) {
    try {
      const order = await createOrder.mutateAsync({
        orderId: values.orderId,
        client: values.client,
        sku: values.sku,
        qty: values.qty,
        priority: values.priority,
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
      });
      navigate(`/orders/${order.orderId}`);
    } catch {
      // Surfaced below via createOrder.isError/error — swallowed here so
      // handleSubmit doesn't also log it as an unhandled rejection.
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-6">
      <Link to="/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to Orders
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Order</CardTitle>
          <CardDescription>Creates an order in Open status.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="flex flex-col gap-4">
            {createOrder.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(createOrder.error)}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orderId">Order ID</Label>
              <Input id="orderId" placeholder="SO-1018" aria-invalid={!!errors.orderId} {...register("orderId")} />
              {errors.orderId && <p className="text-xs text-status-critical">{errors.orderId.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client">Client</Label>
              <Input id="client" aria-invalid={!!errors.client} {...register("client")} />
              {errors.client && <p className="text-xs text-status-critical">{errors.client.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Controller
                control={control}
                name="sku"
                render={({ field }) => (
                  <SkuCombobox
                    value={field.value || null}
                    hasError={!!errors.sku}
                    onSelect={(product) => {
                      field.onChange(product.sku);
                      setSelectedProduct(product);
                    }}
                  />
                )}
              />
              {errors.sku && <p className="text-xs text-status-critical">{errors.sku.message}</p>}
            </div>

            {selectedProduct && (
              <div className="flex flex-col gap-1.5">
                <Label>Product</Label>
                <p className="rounded-md border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                  {selectedProduct.productType}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qty">Quantity</Label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  step={1}
                  aria-invalid={!!errors.qty}
                  {...register("qty")}
                />
                {errors.qty && <p className="text-xs text-status-critical">{errors.qty.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="priority">Priority</Label>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dueDate">Due Date (optional)</Label>
              <Input
                id="dueDate"
                type="date"
                aria-invalid={!!errors.dueDate}
                onChange={(e) => setValue("dueDate", e.target.value, { shouldValidate: true })}
              />
              {errors.dueDate && <p className="text-xs text-status-critical">{errors.dueDate.message}</p>}
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/orders")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create Order"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
