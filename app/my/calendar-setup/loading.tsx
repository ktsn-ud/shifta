import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="p-4 md:p-6">
      <Card className="mx-auto w-full max-w-xl">
        <CardHeader>
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-52" />
          <Skeleton className="h-10 w-20" />
        </CardFooter>
      </Card>
    </section>
  );
}
