type Vec3 = [number, number, number] // rgb vectors
type Mat3 = [Vec3, Vec3, Vec3] // 3x3 matrices

const clamp = (x:number) => x < 0 ? 0 : x > 1 ? 1 : x;

function mulMatrix(M: Mat3, v: Vec3): Vec3{
    return [
        M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
        M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
        M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
    ]
};