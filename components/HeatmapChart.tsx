// components/HeatmapChart.tsx
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

const placeholderHeatmapData: number[][] = [
  [10, 20, 30, 25, 15],
  [15, 25, 35, 30, 20],
  [20, 30, 40, 35, 25],
  [25, 35, 45, 40, 30],
  [30, 40, 50, 45, 35],
];

const getColorForValue = (value: number, maxValue: number = 50): string => {
  const intensity = Math.min(Math.max(value / maxValue, 0), 1); // Normaliza entre 0 e 1
  // Exemplo de gradiente: azul (frio) para vermelho (quente)
  const red = Math.round(255 * intensity);
  const blue = Math.round(255 * (1 - intensity));
  return `rgb(${red}, 0, ${blue})`;
};

interface HeatmapChartProps {
  data?: number[][];
  cellSize?: number;
  showValues?: boolean;
}

const HeatmapChart: React.FC<HeatmapChartProps> = ({
  data = placeholderHeatmapData,
  cellSize = 40,
  showValues = true,
}) => {
  if (!data || data.length === 0) {
    return <Text>No data available for heatmap.</Text>;
  }

  const numRows = data.length;
  const numCols = data[0]?.length || 0;
  const chartWidth = numCols * cellSize;
  const chartHeight = numRows * cellSize;

  // Encontrar valor máximo para normalização de cor (opcional, pode ser fixo)
  let maxValue = 0;
  data.forEach(row => row.forEach(val => {
    if (val > maxValue) maxValue = val;
  }));


  return (
    <View style={styles.container}>
      <Text style={styles.title}>Heatmap (Placeholder)</Text>
      <Svg height={chartHeight} width={chartWidth}>
        {data.map((row, rowIndex) =>
          row.map((value, colIndex) => (
            <React.Fragment key={`${rowIndex}-${colIndex}`}>
              <Rect
                x={colIndex * cellSize}
                y={rowIndex * cellSize}
                width={cellSize}
                height={cellSize}
                fill={getColorForValue(value, maxValue)}
                stroke="black"
                strokeWidth="0.5"
              />
              {showValues && (
                <SvgText
                  x={colIndex * cellSize + cellSize / 2}
                  y={rowIndex * cellSize + cellSize / 2 + 5} // Ajuste para centralizar
                  fontSize="10"
                  fill="black"
                  textAnchor="middle"
                  alignmentBaseline="middle">
                  {value}
                </SvgText>
              )}
            </React.Fragment>
          )),
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});

export default HeatmapChart;