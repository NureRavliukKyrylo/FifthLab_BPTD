export type Product = {
  _id?: string;
  id?: string;
  title: string;
  description: string;
  image_url: string;
  price: number;
  quantity: number;
};

export type CartItem = {
  productId: string;
  title: string;
  price: number;
  imageUrl: string;
  qty: number;
  maxQty?: number;
};
