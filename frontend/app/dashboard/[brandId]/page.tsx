'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getBrandById, BRANDS } from '@/lib/brands';
import { getSampleData, getMonthOptions, BrandDashboardData } from '@/lib/data';
import { ArrowLeft, BarChart3, AlertTriangle } from 'lucide-react';

export default function BrandDashboard() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const brandId = params.brandId as string;
  const monthFromUrl = searchParams.get('month') || '2025-10';
  
  const [brand, setBrand] = useState(getBrandById(brandId));
  const [selectedMonth, setSelectedMonth] = useState(monthFromUrl);
  const [brandData, setBrandData] = useState<BrandDashboardData | null>(null);

  const monthOptions = getMonthOptions();

  useEffect(() => {
    const foundBrand = getBrandById(brandId);
    if (!foundBrand) {
      router.push('/');
      return;
    }
    setBrand(foundBrand);
  }, [brandId, router]);

  useEffect(() => {
    if (selectedMonth) {
      const data = getSampleData(selectedMonth).find(
        (d) => d.brandId === brandId
      );
      setBrandData(data || null);
    }
  }, [selectedMonth, brandId]);

  if (!brand) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">로딩 중...</p>
      </div>
    );
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* 헤더 */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                뒤로가기
              </Button>
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 ${brand.logoColor} rounded-2xl flex items-center justify-center shadow-lg`}>
                  <span className="text-white font-bold text-xl">{brand.code}</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                    {brand.name} 재고주수 대시보드
                  </h1>
                </div>
              </div>
            </div>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="container mx-auto px-6 py-8">
        {brandData ? (
          <div className="space-y-6">
            {/* 핵심 지표 카드 */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-600">
                    매출액 YOY
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">
                    {brandData.salesYOY}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-600">
                    기말재고 YOY
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">
                    {brandData.inventoryYOY}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-600">
                    ACC 기말재고
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatNumber(brandData.accEndingInventory)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">백만원</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-600">
                    ACC 판매액
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatNumber(brandData.accSalesAmount)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">백만원</p>
                </CardContent>
              </Card>
            </div>

            {/* ACC 재고 상세보기 */}
            <Card>
              <CardHeader>
                <CardTitle>ACC 재고 상세보기</CardTitle>
                <CardDescription>
                  {selectedMonth} 기준 아이템별 재고 현황
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm font-semibold text-gray-900 mb-2">신발</p>
                    <div className="text-xs text-gray-900 space-y-1">
                      <p>당년 {formatNumber(brandData.accInventoryDetail.shoes.current)}백만원 ({brandData.accInventoryDetail.shoes.weeks}주)</p>
                      <p className="text-gray-500">/ 전년 {formatNumber(brandData.accInventoryDetail.shoes.previous)}백만원 ({brandData.accInventoryDetail.shoes.previousWeeks}주)</p>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm font-semibold text-gray-900 mb-2">모자</p>
                    <div className="text-xs text-gray-900 space-y-1">
                      <p>당년 {formatNumber(brandData.accInventoryDetail.hat.current)}백만원 ({brandData.accInventoryDetail.hat.weeks}주)</p>
                      <p className="text-gray-500">/ 전년 {formatNumber(brandData.accInventoryDetail.hat.previous)}백만원 ({brandData.accInventoryDetail.hat.previousWeeks}주)</p>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm font-semibold text-gray-900 mb-2">가방</p>
                    <div className="text-xs text-gray-900 space-y-1">
                      <p>당년 {formatNumber(brandData.accInventoryDetail.bag.current)}백만원 ({brandData.accInventoryDetail.bag.weeks}주)</p>
                      <p className="text-gray-500">/ 전년 {formatNumber(brandData.accInventoryDetail.bag.previous)}백만원 ({brandData.accInventoryDetail.bag.previousWeeks}주)</p>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm font-semibold text-gray-900 mb-2">기타ACC</p>
                    <div className="text-xs text-gray-900 space-y-1">
                      <p>당년 {formatNumber(brandData.accInventoryDetail.other.current)}백만원 ({brandData.accInventoryDetail.other.weeks}주)</p>
                      <p className="text-gray-500">/ 전년 {formatNumber(brandData.accInventoryDetail.other.previous)}백만원 ({brandData.accInventoryDetail.other.previousWeeks}주)</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 향후 추가될 그래프 영역 */}
            <Card>
              <CardHeader>
                <CardTitle>4주 / 8주 / 12주 재고주수 비교</CardTitle>
                <CardDescription>
                  그래프 시각화는 데이터 연동 후 제공됩니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
                  <p className="text-gray-400">차트 영역 (준비 중)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <CardTitle>데이터를 불러올 수 없습니다</CardTitle>
              <CardDescription>
                선택한 월의 데이터가 없습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => router.push('/')} variant="outline">
                브랜드 선택으로 돌아가기
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
